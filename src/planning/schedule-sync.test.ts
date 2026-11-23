import {describe,expect,it} from 'vitest';
import {scheduleFixture,scheduleTask} from '../../tests/schedule-fixture';
import {adoptedDay} from './schedule-layers';
import {mergeTutorSchedule} from './schedule-sync';
import type {SyncTask} from './schedule-sync';
import {AUTO_SCHEDULE_ID} from './schedule-sync-state';
import {emptyPlan} from './model';

const binding='a'.repeat(64),today='2026-11-12',now=Date.parse(today+'T04:00:00Z');
const live=(task=scheduleTask,updatedAt=now-2000,createdAt=now-3000):SyncTask=>({task,createdAt,updatedAt});
function fixture(){
 const candidate=scheduleFixture();
 Object.assign(candidate,{accountBinding:binding,revision:9,baseVersion:null});
 candidate.items[0].deadline=today;
 candidate.scope[0].deadline=today;
 const add=(id:string,unit='第11回')=>{
  const item=structuredClone(candidate.items[0]);
  Object.assign(item,{taskId:id,materialId:'legacy-'+id,unit});
  item.ranges[0].id=id+'-range';
  candidate.items.push(item);
  return {...scheduleTask,id,unit};
 };
 const input={
  candidate,current:null,previous:null,source:{planId:candidate.planId,revision:9,digest:'b'.repeat(64),baseVersion:null},
  observedAt:now-1000,tasks:[live()],binding,today,now,targetRounds:['第11回'],autoRevision:0,confirmedCapacities:{},
 };
 return {input,add};
}

describe('partial tutor schedule synchronization',()=>{
 it('keeps a new round unplaced and preserves previously adopted schedules and fixed goals',()=>{
  const {input}=fixture(),current=scheduleFixture(),old=current.items[0];
  Object.assign(current,{accountBinding:binding,revision:3});
  current.scope[0].deadline=today;
  const previous={...old,taskId:'prior',materialId:'legacy-prior',ranges:[{...old.ranges[0],id:'prior-range'}]};
  current.items=[previous];
  const newRound=live({...scheduleTask,id:'added-round',unit:'第14回'});
  const merged=mergeTutorSchedule({...input,current,
   candidate:{...input.candidate,baseVersion:'audit-plan--r3'},source:{...input.source,baseVersion:'audit-plan--r3'},
   tasks:[...input.tasks,newRound,live({...scheduleTask,id:'prior'})],
  });
  expect(merged.plan).toMatchObject({planId:AUTO_SCHEDULE_ID,revision:4,baseVersion:'audit-plan--r3'});
  expect(merged.plan?.items[0]).toEqual(previous);
  expect(merged.plan?.scope).not.toEqual(expect.arrayContaining([expect.objectContaining({unit:'第14回'})]));
  expect(merged.unplaced).toMatchObject([{taskId:'added-round',kind:'B',outcome:'unplaced'}]);
  expect(merged.minutes).toEqual({[today]:15});
  expect(merged.state).toMatchObject({status:'synced',unplaced:1});
  expect(adoptedDay(scheduleTask,merged.plan,today)).toBe(true);
 });

 it('holds completed, newly graded, and manually scheduled tasks independently',()=>{
  const {input,add}=fixture();
  const complete=live({...add('done'),status:'completed'});
  const newlyGraded=live({...add('graded'),history:[{duration:90,graded:true,endAt:now-500}]},now-500);
  const manual=live({...add('manual'),planning:{...emptyPlan(),endDay:'2026-11-13'}});
  const waiting=add('waiting');
  const sameTitle=live({...waiting,id:'other'});
  const merged=mergeTutorSchedule({...input,tasks:[...input.tasks,complete,newlyGraded,manual,sameTitle]});
  expect(merged.changed.map(i=>i.taskId)).toEqual(['normal']);
  expect(merged.state).toMatchObject({status:'partial',waiting:1,conflicts:3});
  expect(merged.classifications).toEqual(expect.arrayContaining([
   expect.objectContaining({taskId:'waiting',kind:'C',outcome:'waiting'}),
   expect.objectContaining({taskId:'other',kind:'B',outcome:'unplaced'}),
   expect.objectContaining({taskId:'done',kind:'D',reason:'完了済み課題'}),
   expect.objectContaining({taskId:'graded',kind:'D',reason:'計画作成後に課題・実績が更新された'}),
   expect.objectContaining({taskId:'manual',kind:'D',outcome:'held'}),
  ]));
  expect(newlyGraded.task.history[0].graded).toBe(true);
 });

 it('retries only a precisely matching registration and never applies the same slots twice',()=>{
  const {input,add}=fixture(),later=add('waiting');
  const first=mergeTutorSchedule(input);
  const repeat=mergeTutorSchedule({...input,current:first.plan,previous:first.state,autoRevision:1});
  expect(repeat.plan).toBeNull();
  expect(repeat.state).toEqual(first.state);
  const next=mergeTutorSchedule({...input,current:first.plan,previous:first.state,autoRevision:1,
   tasks:[...input.tasks,live(later,now-100,now-100)],
  });
  expect(next.plan?.revision).toBe(2);
  expect(next.plan?.items.map(i=>i.taskId)).toEqual(['normal','waiting']);
  expect(next.state).toMatchObject({status:'synced',waiting:0,appliedTaskIds:['normal','waiting']});
 });

 it('rejects stale or conflicting source metadata and impossible merged capacity',()=>{
  const {input}=fixture(),first=mergeTutorSchedule(input);
  expect(()=>mergeTutorSchedule({...input,binding:'f'.repeat(64)})).toThrow('アカウント');
  expect(()=>mergeTutorSchedule({...input,current:first.plan,previous:first.state,source:{...input.source,digest:'c'.repeat(64)}})).toThrow('同じrevision');
  expect(()=>mergeTutorSchedule({...input,current:first.plan,previous:first.state,
   source:{...input.source,revision:8},candidate:{...input.candidate,revision:8}})).toThrow('旧revision');
  expect(()=>mergeTutorSchedule({...input,current:first.plan})).toThrow('採用元revision');
  expect(()=>mergeTutorSchedule({...input,confirmedCapacities:{[today]:10}})).toThrow('学習枠');
 });
});
