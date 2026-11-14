import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const server=await createServer({server:{host:'127.0.0.1',port:5196,strictPort:true},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir('.material-binding-results.local',{recursive:true});
 for(const width of [1440,375]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-14T12:00:00+09:00')});await page.goto('http://127.0.0.1:5196/tests/material-binding-browser.html');
  const grid=page.getByRole('region',{name:'学習スケジュール',exact:true}),detail=page.getByRole('complementary',{name:'選択課題の詳細',exact:true}),row=()=>grid.locator('[data-grid-task="print-12-science-A"]'),editor=detail.getByRole('region',{name:'教材の対応確認'});
  const expand=async()=>{await grid.getByRole('button',{name:'全展開',exact:true}).click();};
  await expand();assert.equal(await grid.locator('[data-grid-task]').count(),22);const order=await grid.locator('[data-grid-task]').evaluateAll(els=>els.map(e=>e.dataset.gridTask));
  await row().locator('.sheet-task-name').click();const select=editor.getByRole('combobox',{name:'候補教材'});await select.waitFor();assert.equal(await select.inputValue(),'');assert.equal(await select.locator('option').count(),4);
  assert.equal(await editor.getByRole('button',{name:'選択した教材との対応を確定'}).isDisabled(),true);
  await select.selectOption({label:'確認テスト ADVANCE（火山と地震）'});await editor.getByRole('button',{name:'選択した教材との対応を確定'}).click();await editor.getByText('利用者確認済み：確認テスト ADVANCE（火山と地震）',{exact:true}).waitFor();
  assert.match(await row().locator('.sheet-task-name').innerText(),/確認テスト ADVANCE（火山と地震）/);assert.equal(await row().locator('.sheet-material-candidate').count(),0);
  assert.match(await editor.innerText(),/共通教材台帳：未同期/);assert.match(await detail.innerText(),/元の登録：プリント - 確認テストA/);
  assert.equal(await page.getByLabel('既存データ維持').innerText(),'true');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const downloadPromise=page.waitForEvent('download');await editor.getByRole('button',{name:'台帳反映用の差分JSONを保存'}).click();const download=await downloadPromise;await download.saveAs(`.material-binding-results.local/diff-${width}.json`);
  const stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const diff=JSON.parse(text);assert.equal(diff.catalogSync,'pending');assert.equal(diff.uid,'alice');assert.equal(diff.changes[0].taskId,'print-12-science-A');
  await page.screenshot({path:`.material-binding-results.local/detail-${width}.png`,fullPage:true});
  await detail.getByRole('button',{name:'課題詳細を閉じる',exact:true}).click();await page.screenshot({path:`.material-binding-results.local/gantt-${width}.png`,fullPage:true});
  await page.reload();await expand();assert.match(await row().innerText(),/ADVANCE/);await row().locator('.sheet-task-name').click();assert.equal(await select.inputValue(),diff.changes[0].binding.materialId);
  await select.selectOption({label:'確認テスト BASIC（火山と地震）'});await editor.getByRole('button',{name:'選択した教材との対応を確定'}).click();await editor.getByText('利用者確認済み：確認テスト BASIC（火山と地震）',{exact:true}).waitFor();
  await page.getByRole('button',{name:'利用者を切替'}).click();await expand();assert.doesNotMatch(await row().locator('.sheet-task-name').innerText(),/BASIC|ADVANCE/);await row().locator('.sheet-task-name').click();assert.equal(await select.inputValue(),'');
  await page.getByRole('button',{name:'利用者を切替'}).click();await expand();assert.match(await row().innerText(),/BASIC/);
  await page.getByRole('button',{name:'画面切替'}).click();await page.getByRole('button',{name:'画面切替'}).click();await expand();assert.match(await row().innerText(),/BASIC/);
  await row().locator('.sheet-task-name').click();await detail.getByRole('button',{name:'学習を開く',exact:true}).click();assert.equal(await page.getByLabel('学習対象').innerText(),'print-12-science-A');
  await row().locator('.sheet-task-name').click();await editor.getByRole('button',{name:'教材対応を解除',exact:true}).click();await editor.getByText('対応未確認',{exact:true}).waitFor();assert.doesNotMatch(await row().locator('.sheet-task-name').innerText(),/BASIC|ADVANCE/);
  await page.reload();await expand();assert.deepEqual(await grid.locator('[data-grid-task]').evaluateAll(els=>els.map(e=>e.dataset.gridTask)),order);assert.equal(await page.getByLabel('既存データ維持').innerText(),'true');assert.deepEqual(errors,[]);
  await context.close();console.log(`PASS ${width}px: select/save/reload/change/clear, account isolation, navigation, unchanged data/order, pending diff export, no overflow`);
 }
}finally{await browser?.close();await server.close();}
