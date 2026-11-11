import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH);
const base='http://127.0.0.1:5178', family='hotfix-study-family', project='demo-study-hotfix';
const endpoint=`http://127.0.0.1:8086/v1/projects/${project}/databases/(default)/documents`;
const password='learning-emulator-only-123',email=`learning-${Date.now()}@example.invalid`;
const response=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
assert.equal(response.status,200,await response.clone().text());const {localId:uid}=await response.json();
const familyResponse=await fetch(`${endpoint}/families/${family}`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:{memberUids:{arrayValue:{values:[{stringValue:uid}]}}}})});assert.equal(familyResponse.status,200,await familyResponse.text());
const out=process.env.TEST_RESULTS_ROOT+'/learning';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'}),context=await browser.newContext({viewport:{width:1440,height:1000}});
const errors=[],external=[];
await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname!=='www.google.com')external.push(url.hostname);return route.abort();});
const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
const invoke=(method,...args)=>page.evaluate(async({method,args})=>(await import('/tests/timer-client.ts'))[method](...args),{method,args});
const waitData=async test=>{for(let i=0;i<100;i++){const data=await invoke("read");if(test(data))return data;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error("Emulator state did not settle");};
try{
 await page.clock.install({time:new Date('2026-11-11T12:00:00+09:00')});
 await page.goto(base+'/tests/timer-setup.html');await invoke('login',email,password);await invoke('seed');
 await page.goto(base);await page.locator('[data-protected-session]').waitFor();await page.getByRole('button',{name:'学習計画・ガント',exact:true}).click();
 const gantt=page.getByRole('region',{name:'学習ガントチャート'});
 // section with aria-label is exposed as a region.
 await gantt.waitFor();await gantt.locator('[data-task-id="normal"]').getByRole('button',{name:'基本問題',exact:true}).click();
 const editor=gantt.getByRole('region',{name:'選んだ課題の計画'});
 for(const [label,day] of [['1〜5ページ','2026-11-11'],['6〜10ページ','2026-11-12']]){
  await editor.getByRole('textbox',{name:'範囲',exact:true}).fill(label);await editor.getByLabel('固定作業量（全範囲で同じ単位）',{exact:true}).fill('5');await editor.getByLabel('予定作業時間（分）',{exact:true}).fill('10');await editor.getByLabel('配置日',{exact:true}).fill(day);await editor.getByRole('button',{name:'範囲を追加',exact:true}).click();
 }
 const save=async()=>{const before=(await invoke('read')).tasks.find(t=>t.id==='normal').planning?.revision??0;await editor.getByRole('button',{name:'計画・範囲の進捗を保存',exact:true}).click();await waitData(data=>(data.tasks.find(t=>t.id==='normal').planning?.revision??0)>before);};
 await save();let data=await invoke('read'),task=data.tasks.find(t=>t.id==='normal');assert.equal(task.planning.ranges.length,2);assert.equal(data.tasks.length,9);assert.equal(task.status,'not_started');
 await editor.getByLabel('範囲が終了',{exact:true}).nth(0).check();await editor.getByLabel('採点が完了',{exact:true}).nth(0).check();await editor.getByLabel('必要な直しが完了（直し不要も含む）',{exact:true}).nth(0).check();await save();
 await gantt.locator('[data-task-id="normal"]').getByText('50%',{exact:true}).waitFor();assert.equal((await invoke('read')).tasks.find(t=>t.id==='normal').status,'not_started');
 await gantt.getByText('保護者：学習可能時間',{exact:true}).click();await gantt.getByLabel('学習可能な分数',{exact:true}).fill('60');await gantt.getByRole('button',{name:'保存',exact:true}).click();await gantt.getByRole('status').filter({hasText:'学習可能時間を保存しました'}).waitFor();
 await editor.getByText('履歴から目標基準を作成・再計画',{exact:true}).click();await editor.getByLabel('手動補正する合計時間（分・履歴不足時は必要）',{exact:true}).fill('30');await editor.getByRole('button',{name:'目標基準を作成して保存',exact:true}).click();await waitData(data=>!!data.tasks.find(t=>t.id==='normal').planning.baseline);
 const baseline=(await invoke('read')).tasks.find(t=>t.id==='normal').planning.baseline;assert.equal(baseline.evidence.provisional,true);
 await editor.getByLabel('終了予定日',{exact:true}).fill('2026-11-20');await save();assert.deepEqual((await invoke('read')).tasks.find(t=>t.id==='normal').planning.baseline,baseline);
 await editor.getByRole('button',{name:'新しい目標基準を保存（旧基準も保持）',exact:true}).click();await waitData(data=>data.tasks.find(t=>t.id==='normal').planning.baselineHistory.length===1);assert.equal((await invoke('read')).tasks.find(t=>t.id==='normal').planning.baselineHistory.length,1);
 for(const width of [1440,768,375]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);await page.screenshot({path:`${out}/gantt-${width}.png`,fullPage:true});}
 await editor.getByLabel('日付タップで移動する範囲',{exact:true}).selectOption({label:'6〜10ページ'});await gantt.locator('[data-task-id="normal"]').getByRole('button',{name:'基本問題を2026-11-13に配置',exact:true}).click();await save();assert.equal((await invoke('read')).tasks.find(t=>t.id==='normal').planning.ranges[1].day,'2026-11-13');
 for(const name of ['範囲が終了','採点が完了','必要な直しが完了（直し不要も含む）'])await editor.getByLabel(name,{exact:true}).nth(1).check();await editor.getByRole('button',{name:'課題全体を完了にする',exact:true}).click();await waitData(data=>data.tasks.find(t=>t.id==='normal').status==='completed');assert.equal((await invoke('read')).tasks.find(t=>t.id==='normal').status,'completed');
 await page.reload();await page.getByRole('button',{name:'学習計画・ガント',exact:true}).click();await gantt.locator('[data-task-id="normal"]').getByText('100%',{exact:true}).waitFor();
 await gantt.locator('[data-task-id="normal"]').getByRole('button',{name:'基本問題',exact:true}).click();await editor.getByRole('button',{name:'タスク・学習タイマーを開く',exact:true}).click();await page.getByRole('button',{name:'学習タイマーを開始',exact:true}).waitFor();
 // Short custom target exercises alarm, continuation, pause, and actual/target recording.
 await page.getByLabel('目標時間の分',{exact:true}).fill('0');await page.getByLabel('目標時間の秒',{exact:true}).fill('3');await page.getByRole('button',{name:'学習タイマーを開始',exact:true}).click();await waitData(data=>data.tasks.find(t=>t.id==='normal').isRunning);await page.clock.runFor(4000);await page.getByRole('alertdialog',{name:'目標時間に到達',exact:true}).waitFor();await page.getByRole('button',{name:'後で戻る',exact:true}).click();
 await waitData(data=>!data.tasks.find(t=>t.id==='normal').isRunning);
 const paused=(await invoke('read')).tasks.find(t=>t.id==='normal');assert.equal(paused.isRunning,false, JSON.stringify({paused,queues:await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>/session.*operation/i.test(k))))}));assert.ok(paused.currentDuration>=3);
 await page.getByRole('button',{name:'計測を終了して記録を保存',exact:true}).click();
 await waitData(data=>data.tasks.find(t=>t.id==='normal').history.length===1);
 const saved=(await invoke('read')).tasks.find(t=>t.id==='normal');assert.equal(saved.history[0].targetSeconds,3);assert.ok(saved.history[0].duration>=3);assert.equal(saved.currentDuration,0);

 if(await page.getByRole('button',{name:'タスク詳細を閉じる',exact:true}).count())await page.getByRole('button',{name:'タスク詳細を閉じる',exact:true}).click();
 // Seed fictional published questions and future review dates through localhost admin only.
 const fixture=await page.evaluate(async()=>{const {sampleQuestions,nextProgress}=await import('/src/review/model.ts');const questions=Array.from({length:7},(_,i)=>({...sampleQuestions[i%5],id:'practice-fixture-'+i,unit:'fixture-'+i}));return {questions,progress:questions.map(q=>nextProgress(undefined,{id:'old-'+q.id,uid:'fixture',sessionId:'old',questionId:q.id,questionVersion:q.version,correct:true,answeredAt:Date.now()-86400000,mode:'daily'}))};});
 const encode=v=>v===null?{nullValue:null}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 for(const [name,rows]of [['questions',fixture.questions],['progress',fixture.progress]])for(const row of rows){const id=row.id??row.questionId;const r=await fetch(endpoint+'/families/'+family+'/reviewUsers/'+uid+'/'+name+'/'+id,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(row).map(([k,v])=>[k,encode(v)]))})});assert.equal(r.status,200);}
 await page.getByRole('button',{name:'対策・復習',exact:true}).click();const review=page.getByRole('region',{name:'テスト対策・復習'});await review.getByText('今日の復習：0問',{exact:true}).waitFor();await review.getByRole('button',{name:'追加練習5問を始める',exact:true}).click();
 const draftKey='study-review-v1:demo-study-hotfix:'+family+':'+uid+':live:draft';const started=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),draftKey);
 for(let i=0;i<5;i++){await review.getByRole('button',{name:/^1\. /}).click();await review.getByRole('button',{name:i===4?'最後の回答を決めて採点':'回答を決めて次へ',exact:true}).click();}
 await review.getByRole('button',{name:'結果を保存する（失敗時は再試行）',exact:true}).click();await review.getByText('保存しました',{exact:true}).waitFor();
 const persisted=await page.evaluate(async()=>(await import('/tests/planning-client.ts')).readReview());assert.equal(persisted.history.length,5);assert.ok(persisted.history.every(a=>a.mode==='practice'));assert.deepEqual(persisted.progress.sort((a,b)=>a.questionId.localeCompare(b.questionId)),fixture.progress.sort((a,b)=>a.questionId.localeCompare(b.questionId)));
 await review.getByRole('button',{name:'復習ホームへ',exact:true}).click();await page.reload();await page.getByRole('button',{name:'対策・復習',exact:true}).click();await review.getByRole('button',{name:'追加練習5問を始める',exact:true}).click();assert.deepEqual((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),draftKey)).questions.map(q=>q.id),started.questions.map(q=>q.id));
 await writeFile(`${out}/result.json`,JSON.stringify({results:['original task IDs and 9-task count preserved','split progress 50% without whole completion','baseline fixed and revision history','date tap moves chosen range','whole completion synced and reload','PC 1440 / 768 / 375 no document overflow','target alarm and pause and stored actual/target','zero due review can practice; live practice history only; daily selection survives reload'],errors,external},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Learning plan browser: 8 flows PASS');
}finally{await browser.close();}
