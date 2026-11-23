import {afterAll,expect,it} from 'vitest';
import {deleteApp,initializeApp} from 'firebase/app';
import {collection,connectFirestoreEmulator,doc,getDocFromServer,getDocsFromServer,getFirestore,setDoc,terminate,updateDoc} from 'firebase/firestore';
import {importSchedule,saveScheduleSyncState,scheduleRoot,scheduleSyncRef,type SchedulePointer,type ScheduleSyncFence} from '../src/planning/schedule-repository';
import {mergeTutorSchedule} from '../src/planning/schedule-sync';
import {canonical} from '../src/planning/schedule';
import {adoptedDay} from '../src/planning/schedule-layers';
import {seedFamily} from './emulator-admin';
import {scheduleFixture,scheduleTask} from './schedule-fixture';

const endpoint=process.env.FIRESTORE_EMULATOR_HOST;
if(!endpoint||!/^127\.0\.0\.1:\d+$/.test(endpoint))throw Error('Local emulator endpoint required');
const family='schedule-sync-'+Date.now(),uid='sync-owner',binding='a'.repeat(64);
const client=(user:string)=>{
 const app=initializeApp({projectId:'demo-study-v182',apiKey:'emulator-only'},family+'-'+user);
 const db=getFirestore(app);
 connectFirestoreEmulator(db,'127.0.0.1',Number(endpoint.split(':')[1]),{mockUserToken:{sub:user}});
 return {app,db};
};
const member=client(uid),other=client('another-member');
afterAll(async()=>{await Promise.all([member,other].map(async({app,db})=>{await terminate(db);await deleteApp(app);}));});

it('atomically adopts the merge as an authenticated member, fences concurrent updates, and preserves all tasks',async()=>{
 await seedFamily(family,[uid,'another-member']);
 const {db}=member,owner={uid,binding,active:()=>true},tasks=collection(db,'families',family,'tasks');
 const taskDoc=doc(tasks,scheduleTask.id),additional={...scheduleTask,id:'round14',unit:'第14回',_writeVersion:1};
 const task={...scheduleTask,_writeVersion:1};
 await setDoc(taskDoc,task);
 await setDoc(doc(tasks,additional.id),additional);
 const stable={...scheduleTask,id:'stable',_writeVersion:1};
 await setDoc(doc(tasks,stable.id),stable);
 const before=await getDocsFromServer(tasks);
 const current=scheduleFixture();
 Object.assign(current,{accountBinding:binding,revision:3});
 current.scope[0].deadline='2026-11-12';
 const oldTask={...scheduleTask,id:'prior',unit:'第11回',_writeVersion:1};
 await setDoc(doc(tasks,oldTask.id),oldTask);
 current.items[0]={...current.items[0],taskId:'prior',materialId:'legacy-prior',ranges:[{...current.items[0].ranges[0],id:'prior-range'}]};
 await importSchedule(db,family,owner,current);
 const pointer=(await getDocFromServer(scheduleRoot(db,family,uid))).data() as SchedulePointer;
 const candidate=scheduleFixture(),now=Date.parse('2026-11-12T04:00:00Z');
 Object.assign(candidate,{accountBinding:binding,revision:9,baseVersion:pointer.versionId});
 candidate.items[0].deadline='2026-11-12';
 candidate.scope[0].deadline='2026-11-12';
 const stableItem=structuredClone(candidate.items[0]);
 candidate.items.push({...stableItem,taskId:stable.id,materialId:'legacy-stable',ranges:[{...stableItem.ranges[0],id:'stable-range'}]});
 const input={candidate,current,source:{planId:candidate.planId,revision:9,digest:'b'.repeat(64),baseVersion:pointer.versionId},
  observedAt:now-1000,tasks:[task,additional,oldTask,stable].map(t=>({task:t,createdAt:now-3000,updatedAt:now-2000})),
  previous:null,autoRevision:0,confirmedCapacities:{},targetRounds:['第11回'],binding,today:'2026-11-12',now};
 const result=mergeTutorSchedule(input),plan=result.plan!;
 const fence:ScheduleSyncFence={pointer,previous:null,next:result.state,capacities:null,
  taskDigests:new Map([[task.id,canonical(task)],[oldTask.id,canonical(oldTask)],[stable.id,canonical(stable)]])};
 await updateDoc(taskDoc,{_writeVersion:2,history:[{duration:60,graded:true,endAt:now-500}]});
 await expect(importSchedule(db,family,owner,plan,fence)).rejects.toThrow('同期中に');
 expect((await getDocFromServer(scheduleRoot(db,family,uid))).data()).toEqual(pointer);
 expect((await getDocFromServer(scheduleSyncRef(db,family,uid))).exists()).toBe(false);
 const taskAfterMatch=(await getDocFromServer(taskDoc)).data() as typeof task;
 const partial=mergeTutorSchedule({...input,tasks:input.tasks.map(t=>t.task.id===task.id?{...t,task:taskAfterMatch,updatedAt:now-500}:t)});
 expect(partial.state).toMatchObject({status:'partial',conflicts:1});
 fence.taskDigests=new Map([[oldTask.id,canonical(oldTask)],[stable.id,canonical(stable)]]);
 fence.next=partial.state;
 await importSchedule(db,family,owner,partial.plan!,fence);
 const adopted=(await getDocFromServer(scheduleRoot(db,family,uid))).data() as SchedulePointer;
 expect(adopted).toMatchObject({revision:4,versionId:'tutor-sync-v1--r4'});
 const saved=(await getDocFromServer(doc(scheduleRoot(db,family,uid),'plans',adopted.versionId))).data()!.plan;
 expect(adoptedDay(stable,saved,'2026-11-12')).toBe(true);
 expect(adoptedDay(stable,saved,'2026-11-13')).toBe(false);
 expect(adoptedDay(task,saved,'2026-11-12')).toBe(false);
 expect((await getDocFromServer(taskDoc)).data()).toEqual(taskAfterMatch);
 expect((await getDocFromServer(doc(tasks,additional.id))).data()).toEqual(before.docs.find(d=>d.id===additional.id)?.data());
 expect((await getDocFromServer(doc(scheduleRoot(db,family,uid),'plans',pointer.versionId))).data()?.plan).toEqual(current);
 const storedState=(await getDocFromServer(scheduleSyncRef(db,family,uid))).data();
 expect(storedState).toEqual(partial.state);
 await expect(saveScheduleSyncState(db,family,owner,{...fence,pointer:adopted,previous:partial.state})).resolves.toBe(false);
 await expect(getDocFromServer(scheduleSyncRef(other.db,family,uid))).rejects.toMatchObject({code:'permission-denied'});
 await expect(setDoc(scheduleSyncRef(other.db,family,uid),result.state)).rejects.toMatchObject({code:'permission-denied'});
 await expect(setDoc(scheduleSyncRef(db,family,uid),{...result.state,versionId:pointer.versionId})).rejects.toMatchObject({code:'permission-denied'});
});
