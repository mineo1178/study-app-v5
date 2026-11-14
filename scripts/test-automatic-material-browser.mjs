import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const topics={math:{11:'仕事に関する問題',12:'水深の変化と比'},science:{11:'光と音',12:'火山と地震'},social:{11:'江戸時代⑵',12:'江戸時代⑶'}},levels={A:'ADVANCE',B:'BASIC',S:'STANDARD'};
const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir('.automatic-material-results.local',{recursive:true});
 for(const width of [1440,375]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-15T09:00:00+09:00')});await page.goto('http://127.0.0.1:5197/tests/material-binding-browser.html');
  const grid=page.getByRole('region',{name:'学習スケジュール',exact:true}),detail=page.getByRole('complementary',{name:'選択課題の詳細',exact:true}),list=page.locator('.print-binding-list');
  const expand=async()=>grid.getByRole('button',{name:'全展開',exact:true}).click(),row=()=>grid.locator('[data-grid-task="print-12-science-A"]');await expand();
  const rows=await grid.locator('[data-grid-task]').evaluateAll(els=>els.map(e=>({id:e.dataset.gridTask,title:e.querySelector('.sheet-task-name').getAttribute('title'),text:e.querySelector('.sheet-task-name').textContent})));assert.equal(rows.length,22);
  for(const r of rows){const [kind,round,subjectOrLetter,letter]=r.id.split('-'),name=kind==='calc'?'計算テスト':'確認テスト',level=levels[kind==='calc'?subjectOrLetter:letter],topic=kind==='calc'?'':`（${topics[subjectOrLetter][round]}）`,expected=name+' '+level+topic;assert.equal(r.text,expected);assert.ok(r.title.startsWith(expected));}
  assert.doesNotMatch(await grid.innerText(),/候補資料|対応未確認|種類未確認/);assert.equal(await page.getByLabel('既存データ維持').innerText(),'true');
  await page.screenshot({path:`.automatic-material-results.local/gantt-${width}.png`,fullPage:true});await row().locator('.sheet-task-name').click();
  await detail.getByRole('heading',{name:'確認テスト ADVANCE（火山と地震）',exact:true}).waitFor();await detail.getByText('自動対応：確認テスト ADVANCE（火山と地震）',{exact:true}).waitFor();
  await page.screenshot({path:`.automatic-material-results.local/detail-${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await detail.getByRole('button',{name:'課題詳細を閉じる',exact:true}).click();await list.locator(':scope > summary').click();assert.match(await list.locator(':scope > summary').innerText(),/例外0／全22/);assert.equal(await list.locator('[data-binding-task]').count(),0);
  await list.getByRole('checkbox',{name:'例外だけ表示'}).uncheck();assert.equal(await list.locator('[data-binding-task]').count(),22);const card=()=>list.locator('[data-binding-task="print-12-science-A"]');await card().locator(':scope > summary').click();
  await card().getByRole('combobox',{name:'候補教材'}).selectOption({label:'確認テスト BASIC（火山と地震）'});await card().getByRole('button',{name:'選択した教材との対応を確定'}).click();await card().getByText('利用者確認済み：確認テスト BASIC（火山と地震）',{exact:true}).waitFor();assert.match(await row().innerText(),/BASIC/);
  await page.reload();await expand();assert.match(await row().innerText(),/BASIC/);await page.getByRole('button',{name:'利用者を切替'}).click();await expand();assert.match(await row().innerText(),/ADVANCE/);await page.getByRole('button',{name:'利用者を切替'}).click();await expand();assert.match(await row().innerText(),/BASIC/);
  await row().locator('.sheet-task-name').click();await detail.getByRole('button',{name:'教材対応を解除',exact:true}).click();await detail.getByText('自動対応：確認テスト ADVANCE（火山と地震）',{exact:true}).waitFor();assert.match(await row().innerText(),/ADVANCE/);
  await page.reload();await expand();assert.match(await row().innerText(),/ADVANCE/);assert.equal(await page.getByLabel('既存データ維持').innerText(),'true');assert.deepEqual(errors,[]);
  await context.close();console.log(`PASS ${width}px: all 22 automatic formal names, science12 B/S/A, detail/tooltips, no unresolved labels, saved override priority/reload/account isolation/clear, immutable input, no overflow`);
 }
}finally{await browser?.close();await server.close();}
