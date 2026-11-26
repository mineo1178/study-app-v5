import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {emptyPlan} from '../src/planning/model';
import {detectReplan,handleReplan,replanCapacities,replanSnapshot,trackedReplanRounds,tutorInput,validateTutorPlan} from '../scripts/schedule-sync/replan';
import {publishReady,readReady,writeJsonAtomic} from '../scripts/schedule-sync/manifest';
import {mergeTutorSchedule} from '../src/planning/schedule-sync';
import {scheduleFixture,scheduleTask} from './schedule-fixture';

const today='2026-11-12',now=Date.parse(today+'T04:00:00Z'),binding='a'.repeat(64);
const registered={...scheduleTask,id:'new-round-task',unit:'第14回',planning:{...emptyPlan(),deadline:today,ranges:[{
 id:'new-range',label:'確認済み範囲',minutes:20,units:5,day:'',done:false,graded:false,corrected:false,actualDay:null,actualSeconds:null,
}]}};
const row={taskId:registered.id,unit:registered.unit,status:registered.status,createdAt:now-10,updatedAt:now-10};
const events=detectReplan([row],{snapshot:[]},[row],[row.unit]);
const rounds=[registered.unit];

it('detects a new round and task, grading and correction changes, completion and the first overdue day',()=>{
 const task={...scheduleTask,planning:{...emptyPlan(),deadline:'2026-11-11'}};
 const first={...row,taskId:task.id,unit:task.unit,...replanSnapshot(task,null,undefined,'2026-11-11')};
 const graded={...task,history:[{duration:60,graded:true,score:0}]};
 const second={...first,updatedAt:now-5,...replanSnapshot(graded,null,undefined,today)};
 const changes=detectReplan([row,second],{snapshot:[first],replanEvents:[]},[row],[row.unit]);
 expect(changes.map(e=>e.kind)).toEqual(['task_added','round_added','progress_changed','overdue']);
 expect(detectReplan([row,second],{snapshot:[row,second],replanEvents:changes},[],[])).toEqual([]);
 const corrected={...graded,history:[...graded.history,{duration:30,attemptType:'redo'}]};
 const third={...second,updatedAt:now-2,...replanSnapshot(corrected,null,undefined,today)};
 expect(detectReplan([third],{snapshot:[second],replanEvents:[]},[],[]).map(e=>e.kind)).toEqual(['progress_changed']);
 expect(detectReplan([{...third,status:'completed',overdueDay:null}],{snapshot:[third],replanEvents:[]},[],[]).map(e=>e.kind)).toEqual(['completed']);
 expect(detectReplan([row],{snapshot:[row],newRounds:[row.unit],newlyRegistered:[row]},[],[])).toEqual(events);
});

it('publishes only verified ranges for a new round and leaves adoption to the next sync',async()=>{
 const root=await mkdtemp(join(tmpdir(),'schedule-replan-'));
 try{
  const current=scheduleFixture();current.accountBinding=binding;
  const protectedTask={...registered,id:'manual',planning:{...registered.planning,endDay:today}};
  const input={current,previous:null,autoRevision:0,binding,today,confirmedCapacities:{[today]:40},observedAt:now,
   tasks:[scheduleTask,registered,protectedTask].map(task=>({task,createdAt:now-10,updatedAt:now-10}))};
  const available=tutorInput(input,rounds);
  expect(available.options.map(o=>o.item.taskId)).toEqual([registered.id]);
  expect(available.data.available[today]).toBe(25);
  expect(()=>validateTutorPlan(input,available,[{task:0,days:['2026-11-13']}],current.planId,2,now)).toThrow('確定期限');
  const tooSmall={...input,confirmedCapacities:{[today]:30}};
  expect(tutorInput(tooSmall,rounds).diagnostics.find(r=>r.taskId===registered.id)?.reason).toBe('capacity');
  const plan=validateTutorPlan(input,available,[{task:0,days:[today]}],current.planId,2,now)!;
  const candidate='02_candidates/verified.json';
  await mkdir(join(root,'02_candidates'));
  await writeJsonAtomic(join(root,candidate),plan.candidate);
  await expect(publishReady(root,candidate,new Date(now).toISOString(),plan.targetRounds,'b'.repeat(64))).rejects.toThrow('SHA-256');
  expect(await readReady(root)).toBeNull();
  await publishReady(root,candidate,new Date(now).toISOString(),plan.targetRounds);
  const ready=(await readReady(root))!;
  const adoption=mergeTutorSchedule({...input,...ready,now,targetRounds:ready.manifest.rounds});
  expect(adoption.plan?.items).toEqual([current.items[0],expect.objectContaining({taskId:registered.id,deadline:today,baseline:expect.objectContaining({id:'unset'})})]);
  expect(adoption.changed.map(i=>i.taskId)).toEqual([registered.id]);
 }finally{await rm(root,{recursive:true,force:true});}
});

it('persists a single request for the same difference when the CLI is unavailable',async()=>{
 const root=await mkdtemp(join(tmpdir(),'schedule-requests-'));
 try{
  const input={current:null,previous:null,autoRevision:0,tasks:[{task:registered,createdAt:now-10,updatedAt:now-10}],binding,today,confirmedCapacities:{},observedAt:now};
  const options={stateDir:root,root,events,rounds,input,available:tutorInput(input,rounds),stillCurrent:async()=>true};
  const first=await handleReplan(options);
  expect(await handleReplan({...options,input:{...input,observedAt:now+10}})).toEqual({...first,duplicate:true});
  const requests=await readdir(join(root,'requests'));
  expect(requests).toHaveLength(1);
  expect(JSON.parse(await readFile(join(root,'requests',requests[0]),'utf8'))).toMatchObject({events,status:'requested'});
  expect(await readReady(root)).toBeNull();
 }finally{await rm(root,{recursive:true,force:true});}
});

it('fills seven JST dates with weekday defaults and preserves confirmed zero and an already adopted capacity',()=>{
 expect(replanCapacities(today,{'2026-11-11':75,'2026-11-17':42},{'2026-11-13':0})).toEqual({
  '2026-11-12':40,'2026-11-13':0,'2026-11-14':30,'2026-11-15':20,'2026-11-16':10,'2026-11-17':42,'2026-11-18':10,
 });
});

it('uses a future provisional slot and keeps all dates and capacities outside the candidate intact',()=>{
 const current=scheduleFixture();current.accountBinding=binding;
 current.capacities['2026-11-11']=75;
 const task={...registered,planning:{...registered.planning,deadline:'2026-11-14'}};
 const input={current,previous:null,autoRevision:0,binding,today,observedAt:now,confirmedCapacities:{[today]:0},
  tasks:[scheduleTask,task].map(task=>({task,createdAt:now-10,updatedAt:now-10}))};
 const evaluation=tutorInput(input,rounds);
 expect(evaluation.placements).toEqual([{task:0,days:['2026-11-14']}]);
 const validated=validateTutorPlan(input,evaluation,evaluation.placements,current.planId,2,now)!;
 expect(validated.candidate.capacities).toEqual({'2026-11-14':30});
 const applied=mergeTutorSchedule({...input,candidate:validated.candidate,targetRounds:validated.targetRounds,now,
  source:{planId:current.planId,revision:2,baseVersion:current.planId+'--r1',digest:'a'.repeat(64)}});
 expect(applied.plan?.capacities).toEqual({...current.capacities,'2026-11-14':30});
 expect(applied.plan?.items[0]).toEqual(current.items[0]);
 expect(tutorInput({...input,current:{...current,revision:2}},rounds).fingerprint).not.toBe(evaluation.fingerprint);
 expect(tutorInput({...input,tasks:[input.tasks[0],{...input.tasks[1],task:{...task,planning:{...task.planning,deadline:today}}}]},rounds).fingerprint).not.toBe(evaluation.fingerprint);
 expect(tutorInput({...input,tasks:[input.tasks[0],{...input.tasks[1],task:{...task,planning:emptyPlan()}}]},rounds).fingerprint).not.toBe(evaluation.fingerprint);
});

it('classifies missing work, expired deadlines and protection before calculating capacity',()=>{
 const missing={...registered,id:'missing',planning:emptyPlan()};
 const overdue={...registered,id:'overdue',planning:{...registered.planning,deadline:'2026-11-11'}};
 const protectedTask={...registered,id:'protected',planning:{...registered.planning,ranges:registered.planning.ranges.map(r=>({...r,graded:true}))}};
 const other={...registered,id:'other',subject:'unknown'};
 const tasks=[registered,missing,overdue,protectedTask,other].map(task=>({task,createdAt:now-10,updatedAt:now-10}));
 const evaluation=tutorInput({current:null,previous:null,autoRevision:0,tasks,binding,today,observedAt:now,confirmedCapacities:{[today]:0}},rounds);
 expect(Object.fromEntries(evaluation.diagnostics.map(({taskId,reason})=>[taskId,reason]))).toEqual({
  [registered.id]:'capacity',missing:'missing_work',overdue:'overdue',protected:'protected',other:'other',
 });
 expect(evaluation.eligibleTasks).toBe(1);
 expect(evaluation.placements).toEqual([]);
});

it('reevaluates pending rounds after useful changes and records CLI failure separately',async()=>{
 const root=await mkdtemp(join(tmpdir(),'schedule-reconsider-'));
 try{
  const initial={current:null,previous:null,autoRevision:0,tasks:[{task:registered,createdAt:now-10,updatedAt:now-10}],
   binding,today,confirmedCapacities:{[today]:0},observedAt:now};
  const run=(input:typeof initial,changes=events)=>handleReplan({stateDir:root,root,events:changes,rounds,input,
   available:tutorInput(input,rounds),executable:join(root,'nonexistent-tutor.exe'),stillCurrent:async()=>true});
  const pending=await run(initial);
  expect(pending?.status).toBe('no_safe_plan');
  expect(await trackedReplanRounds(root,null,[])).toEqual(rounds);
  expect(await run({...initial,observedAt:now+10},[])).toEqual({...pending,duplicate:true});
  const withCapacity={...initial,confirmedCapacities:{[today]:20}};
  const dispatch=await run(withCapacity,[]);
  expect(dispatch?.status).toBe('cli_failed');
  expect(dispatch?.id).not.toBe(pending?.id);
  expect(await run(withCapacity,[])).toEqual({...dispatch,duplicate:true});
  expect(JSON.parse(await readFile(join(root,'requests',dispatch!.id+'.json'),'utf8'))).toMatchObject({cliStarted:false,placeable:1});
  expect(await readReady(root)).toBeNull();
 }finally{await rm(root,{recursive:true,force:true});}
});
