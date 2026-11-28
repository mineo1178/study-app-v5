import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH);
const base='http://127.0.0.1:5178';
const endpoint='http://127.0.0.1:8086/v1/projects/demo-study-hotfix/databases/(default)/documents';
const email=`preview-${Date.now()}@example.invalid`,password='emulator-only-preview';
const signup=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only',{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true}),
});
assert.equal(signup.status,200);
const {localId:uid}=await signup.json();
const membership=await fetch(endpoint+'/families/hotfix-study-family',{
 method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},
 body:JSON.stringify({fields:{memberUids:{arrayValue:{values:[{stringValue:uid}]}}}}),
});
assert.equal(membership.status,200);

const out=process.env.TEST_RESULTS_ROOT+'/gantt-preview';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:1440,height:1050}});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
const fixture=(name,...args)=>page.evaluate(async({name,args})=>(await import('/tests/gantt-preview-client.ts'))[name](...args),{name,args});
const grid=page.getByRole('region',{name:'学習スケジュール',exact:true});
const row=id=>grid.locator(`[data-grid-task="${id}"]`);
const summary=grid.getByRole('region',{name:'今日から14日間の仮予定'});

async function openGrid(){
 await page.getByRole('button',{name:'スケジュール',exact:true}).click();
 await summary.getByRole('status').filter({hasText:'正式予定'}).waitFor();
 await grid.getByRole('button',{name:'全展開',exact:true}).click();
}

try{
 await page.clock.install({time:new Date('2026-11-28T12:00:00+09:00')});
 await page.goto(base+'/tests/timer-setup.html');
 await page.evaluate(async({email,password})=>(await import('/tests/timer-client.ts')).login(email,password),{email,password});
 await fixture('seedPreview');
 await page.goto(base);
 await openGrid();
 const before=await fixture('snapshotPreview');
 assert.equal(before.tasks.length,98);
 assert.equal(before.tasks.filter(t=>t.unit==='第13回'&&t.status==='completed'&&t.subject==='math').length,19);
 assert.equal(before.tasks.filter(t=>t.unit==='第14回'&&t.status!=='completed').length,44);
 assert.equal(await grid.locator('.sheet-axis > strong').count(),29);
 assert.match(await grid.locator('.sheet-axis > .sheet-today').innerText(),/0分／0分/);
 assert.equal(await grid.locator('[data-preview-day="2026-11-28"]').count(),0);
 await row('official-13').locator('.sheet-plan').waitFor();
 await row('official-13').locator('.sheet-actual').waitFor();
 assert.equal(await row('official-13').locator('.sheet-draft').count(),0);
 await row('round-13-01').getByText('期限超過',{exact:false}).waitFor();
 assert.equal(await row('round-13-01').locator('.sheet-draft').getAttribute('data-preview-day'),'2026-11-29');

 const drafts=grid.locator('[data-grid-task^="round-14-"] .sheet-draft');
 const firstDraft=drafts.first();
 await firstDraft.waitFor();
 const draftTask=await firstDraft.evaluate(el=>el.closest('[data-grid-task]').getAttribute('data-grid-task'));
 const draftDay=await firstDraft.getAttribute('data-preview-day');
 assert.match(await firstDraft.getAttribute('aria-label'),/仮15分・範囲未確認/);
 assert.equal(await firstDraft.evaluate(el=>getComputedStyle(el).borderTopStyle),'dashed');
 assert.ok(await drafts.count()<44);
 assert.equal(await grid.locator('[data-grid-task^="round-13-"] .sheet-draft').count(),1);
 const initial=(await summary.getByRole('status').innerText()).trim();
 assert.match(initial,/正式予定 1件 ／ 仮予定 4件 ／ 未配置 43件/);
 await summary.getByText('未配置の理由（43件）',{exact:true}).click();
 await summary.getByText('空き枠不足',{exact:false}).first().waitFor();
 await summary.getByText('未配置の理由（43件）',{exact:true}).click();

 await summary.getByRole('button',{name:'未完了のみ',exact:true}).click();
 assert.equal(await grid.locator('[data-grid-task]').count(),48);
 assert.equal(await row('round-13-30').count(),0);
 await summary.getByRole('button',{name:'未完了のみ',exact:true}).click();
 assert.equal(await grid.locator('[data-grid-task]').count(),98);
 await grid.getByRole('button',{name:'今日',exact:true}).click();
 await firstDraft.scrollIntoViewIfNeeded();
 await grid.screenshot({path:out+'/29-days-desktop.png'});
 await page.setViewportSize({width:375,height:812});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await summary.screenshot({path:out+'/mobile-summary.png'});
 await page.setViewportSize({width:1440,height:1050});

 await summary.getByRole('spinbutton').fill('10');
 await summary.getByRole('button',{name:'仮の分数を設定',exact:true}).click();
 await grid.locator('[data-grid-task^="round-14-"] .sheet-draft').first().getByText('仮10分',{exact:true}).waitFor();
 await page.reload();
 await openGrid();
 assert.equal(await summary.getByRole('spinbutton').inputValue(),'10');
 assert.deepEqual(await fixture('snapshotPreview'),before,'Displaying or editing provisional estimates must not change Firestore');

 await fixture('adoptPreviewTask',draftTask,draftDay);
 await row(draftTask).locator('.sheet-plan').waitFor();
 assert.equal(await row(draftTask).locator('.sheet-draft').count(),0);
 assert.deepEqual((await fixture('snapshotPreview')).tasks,before.tasks,'Adoption must preserve the tasks and actuals');
 await row('official-13').locator('.sheet-actual').waitFor();
 assert.deepEqual(errors,[]);
 await writeFile(out+'/result.json',JSON.stringify({initial,previewRound14:3,confirmedZero:true,adoptionReplacedPreview:true,preservedTasks:true,columns:29,errors}));
 console.log('29-day Gantt: confirmed zero, 44 unfinished, overdue priority, no double display, no preview writes');
}finally{await context.close();await browser.close();}
