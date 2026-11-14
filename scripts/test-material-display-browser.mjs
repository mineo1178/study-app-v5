import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const server=await createServer({server:{host:'127.0.0.1',port:5195,strictPort:true},logLevel:'error'});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:'msedge'});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-11-14T12:00:00+09:00')});
 await mkdir('.material-display-results.local',{recursive:true});
 for(const width of [1440,375]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:5195/tests/material-display-browser.html');
  const grid=page.getByRole('region',{name:'学習スケジュール',exact:true});
  await grid.getByRole('button',{name:'全展開',exact:true}).click();
  const rows=grid.locator('[data-grid-task]');assert.equal(await rows.count(),21);
  const row=id=>grid.locator('[data-grid-task="'+id+'"]');
  for(const [id,label] of [['over-one','期限超過 1日'],['over-many','期限超過 4日'],['formal-manual','期限超過 2日'],['today','期限当日'],['near','期限接近 あと3日']]){
   const badge=row(id).locator('.sheet-deadline-badge');assert.match(await badge.innerText(),new RegExp(label));assert.match(await badge.getAttribute('title'),/期限日：.*根拠：.*状態：未完了/);
  }
  assert.equal(await row('done').locator('.sheet-deadline-badge').count(),0);assert.equal(await row('unknown').locator('.sheet-deadline-badge').count(),0);
  assert.match(await grid.getByLabel('期限警告の凡例').innerText(),/赤い警告ラベル：期限超過（未完了かつ確定期限を経過）/);
  assert.match(await grid.getByLabel('期限警告の凡例').innerText(),/赤実線.*期限警告とは別/);
  assert.equal(await row('unknown-A').locator('.sheet-material-candidate').innerText(),'対応未確認');
  assert.match(await row('unknown-A').locator('.sheet-material-candidate').getAttribute('title'),/火山と地震.*対応未確認/);
  for(const name of ['漢字テスト','言語知識テスト','理科まとめプリント','レベルアッププリント'])assert.match(await row('catalog-'+name).locator('.sheet-task-name').innerText(),new RegExp(name));
  assert.match(await row('catalog-レベルアッププリント').innerText(),/SSクラス対象/);
  assert.match(await row('catalog-理科まとめプリント').innerText(),/正式表題未確認/);
  // Text must remain within the fixed name cell, even with three lines.
  for(const id of ['over-one','over-many','unknown-A','unknown-A-overdue']){
   const rects=await row(id).locator('.sheet-name').evaluate(el=>{const p=el.getBoundingClientRect();return [...el.children].map(c=>{const r=c.getBoundingClientRect();return {inside:r.x>=p.x&&r.right<=p.right+1&&r.y>=p.y&&r.bottom<=p.bottom+1};});});assert.ok(rects.every(r=>r.inside));
  }
  const ordered=await rows.evaluateAll(els=>els.map(el=>el.dataset.gridTask));
  assert.deepEqual(ordered.filter(id=>id.startsWith('confirmed-')),['confirmed-BASIC','confirmed-STANDARD','confirmed-ADVANCE']);
  const verified=grid.locator('[data-grid-task="confirmed-ADVANCE"] .sheet-task-name');
  assert.match(await verified.getAttribute('title'),/確認テスト ADVANCE（火山と地震）/);
  assert.match(await grid.locator('[data-grid-task="unknown-A"]').innerText(),/旧登録 A（対応未確認）/);
  assert.ok(!(await grid.locator('[data-grid-task="unknown-A"] .sheet-task-name').getAttribute('title')).includes('ADVANCE'));
  assert.match(await grid.locator('[data-grid-task="calc"] .sheet-task-name').innerText(),/計算テスト（種類未確認）/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const nameWidth=await grid.locator('.sheet-name').first().evaluate(el=>el.getBoundingClientRect().width);
  assert.ok(nameWidth<=(width===375?140:300));
  await verified.click();
  const detail=page.getByRole('complementary',{name:'選択課題の詳細',exact:true});await detail.waitFor();
  await detail.getByRole('heading',{name:'確認テスト ADVANCE（火山と地震）',exact:true}).waitFor();
  assert.match(await detail.innerText(),/元の登録：プリント - 確認テストA/);
  assert.equal(await page.getByLabel('unchanged tasks').innerText(),'true');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'.material-display-results.local/detail-'+width+'.png',fullPage:true});
  await detail.getByRole('button',{name:'課題詳細を閉じる',exact:true}).click();
  await grid.locator('.sheet-scroll').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'.material-display-results.local/gantt-'+width+'.png',fullPage:true});
  await row('over-many').locator('.sheet-task-name').click();await detail.waitFor();
  assert.match(await detail.innerText(),/期限超過 4日/);assert.match(await detail.innerText(),/2026-11-10/);assert.match(await detail.innerText(),/課題に明示された締切/);
  await page.screenshot({path:'.material-display-results.local/warning-'+width+'.png',fullPage:true});
  await detail.getByRole('button',{name:'課題詳細を閉じる',exact:true}).click();
  await row('training').locator('.sheet-task-name').click();await detail.waitFor();assert.match(await detail.innerText(),/教材カテゴリ「練成問題」＋課題「トレーニング」/);
  await page.reload();await grid.getByRole('button',{name:'全展開',exact:true}).click();
  assert.deepEqual(await rows.evaluateAll(els=>els.map(el=>el.dataset.gridTask)),ordered);
  console.log('PASS '+width+'px: verified/unknown display, B-S-A evidence order, tooltip/detail, fixed-column width, no overflow, stable reload, no task writes');
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await server.close();}
