import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir('.task-safety-results.local',{recursive:true});
 for(const width of [1440,375]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-14T12:00:00+09:00')});await page.goto('http://127.0.0.1:5197/tests/material-binding-browser.html');
  const list=page.locator('.print-binding-list'),card=()=>list.locator('[data-binding-task="print-12-science-A"]');
  await list.locator(':scope > summary').click();assert.equal(await list.locator('[data-binding-task]').count(),22);
  assert.equal(await list.locator('[data-binding-task^="print-12-science-"]').count(),3);
  await card().locator(':scope > summary').click();const select=()=>card().getByRole('combobox',{name:'候補教材'});
  assert.equal(await select().inputValue(),'');assert.equal(await select().locator('option').count(),4);
  await page.screenshot({path:`.task-safety-results.local/list-unconfirmed-${width}.png`,fullPage:true});
  await select().selectOption({label:'確認テスト ADVANCE（火山と地震）'});await card().getByRole('button',{name:'選択した教材との対応を確定'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-binding-task]').length===21);
  const grid=page.getByRole('region',{name:'学習スケジュール',exact:true});await grid.getByRole('button',{name:'全展開',exact:true}).click();
  assert.match(await grid.locator('[data-grid-task="print-12-science-A"]').innerText(),/ADVANCE/);
  await list.getByRole('checkbox',{name:'未確認だけ表示'}).uncheck();await card().locator(':scope > summary').click();
  await card().getByText('利用者確認済み：確認テスト ADVANCE（火山と地震）',{exact:true}).waitFor();
  const downloadPromise=page.waitForEvent('download');await card().getByRole('button',{name:'台帳反映用の差分JSONを保存'}).click();const download=await downloadPromise;await download.saveAs(`.task-safety-results.local/diff-${width}.json`);
  await page.screenshot({path:`.task-safety-results.local/list-confirmed-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.getByLabel('既存データ維持').innerText(),'true');
  await page.reload();await list.locator(':scope > summary').click();assert.match(await list.locator(':scope > summary').innerText(),/未確認21／全22/);
  await list.getByRole('checkbox',{name:'未確認だけ表示'}).uncheck();await card().locator(':scope > summary').click();assert.notEqual(await select().inputValue(),'');
  await select().selectOption({label:'確認テスト BASIC（火山と地震）'});await card().getByRole('button',{name:'選択した教材との対応を確定'}).click();await card().getByText('利用者確認済み：確認テスト BASIC（火山と地震）',{exact:true}).waitFor();
  await card().getByRole('button',{name:'教材対応を解除',exact:true}).click();await card().getByText('対応未確認',{exact:true}).waitFor();
  await page.reload();await list.locator(':scope > summary').click();assert.equal(await list.locator('[data-binding-task]').count(),22);
  await page.getByRole('button',{name:'利用者を切替'}).click();await list.locator(':scope > summary').click();assert.equal(await list.locator('[data-binding-task]').count(),22);
  await page.goto('http://127.0.0.1:5197/tests/deleted-tasks-browser.html');await page.getByText('削除した課題を復元（1件）',{exact:true}).click();
  await page.screenshot({path:`.task-safety-results.local/restore-${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'復元',exact:true}).click();assert.equal(await page.getByLabel('復元taskId').innerText(),'original');await page.getByText('削除した課題を復元（0件）',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: 22 prints / science12 x3, no default selection, list save/reload/change/clear, immediate Gantt update, account isolation, pending diff export, immutable inputs, restore control, no overflow`);
 }
}finally{await browser?.close();await server.close();}
