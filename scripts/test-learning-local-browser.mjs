import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const server=await createServer({server:{host:'127.0.0.1',port:5189,strictPort:true},logLevel:'error'});let browser;
const out='.verification.local';await mkdir(out,{recursive:true});
try{await server.listen();browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:375,height:900}});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-11-11T12:00:00+09:00')});await page.goto('http://127.0.0.1:5189/tests/timer-review-browser.html');await page.getByRole('button',{name:'Calculation fixture',exact:true}).click();
 await page.getByLabel('目標時間の分',{exact:true}).fill('0');await page.getByLabel('目標時間の秒',{exact:true}).fill('3');await page.getByRole('button',{name:'計算をはじめる',exact:true}).click();await page.clock.runFor(4000);await page.getByRole('alertdialog',{name:'目標時間に到達'}).waitFor();await page.getByRole('button',{name:'続ける',exact:true}).click();
 const key='calculation-active-fixture-fixture-fixture-calc';const read=()=>page.evaluate(k=>{const day=localStorage.getItem(k);return JSON.parse(localStorage.getItem('study-app-v5-fixture-fixture-calculation-'+day+'-fixture-calc'));},key);
 const before=await read();assert.equal(before.targetSeconds,3);assert.ok(before.elapsedSeconds>=3);

 // Use relative wall-clock jumps instead of running interval callbacks to simulate suspension.
 await page.evaluate(()=>{window.__wakeAt=Date.now()+120000;});const wake=await page.evaluate(()=>window.__wakeAt);await page.clock.setSystemTime(wake);await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));const after=await read();assert.ok(after.elapsedSeconds>=before.elapsedSeconds+120);
 await page.evaluate(()=>{window.__reloadAt=Date.now()+30000;});await page.clock.setSystemTime(await page.evaluate(()=>window.__reloadAt));await page.reload();await page.getByRole('button',{name:'Calculation fixture',exact:true}).click();await page.getByRole('button',{name:'計測を再開',exact:true}).waitFor();
 await page.getByRole('alertdialog',{name:'目標時間に到達'}).waitFor({state:'hidden'}); // acknowledgment survives reload
 const restored=await read(); // persisted stored snapshot remains running until resume, UI restoration is paused
 await page.getByRole('button',{name:'計測を再開',exact:true}).click();await page.clock.runFor(1000);const resumed=await read();assert.ok(resumed.elapsedSeconds>=after.elapsedSeconds+30);assert.equal(resumed.targetSeconds,3);
 await page.getByRole('button',{name:'計算を終了して結果を記録',exact:true}).click();await page.getByRole('button',{name:'0',exact:true}).waitFor();const scoring=await read();assert.equal(scoring.phase,'scoring');const finalSeconds=scoring.elapsedSeconds;await page.clock.setSystemTime((await page.evaluate(()=>Date.now()))+60000);await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));assert.equal((await read()).elapsedSeconds,finalSeconds);
 await page.screenshot({path:out+'/calculation-target-375.png',fullPage:true});assert.deepEqual(errors,[]);await writeFile(out+'/calculation-wake.json',JSON.stringify({before,after,restored,resumed,scoring,errors},null,2));console.log('Calculation target/suspension/reload/pause: PASS');
}finally{await browser?.close();await server.close();}
