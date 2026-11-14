import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDocFromServer,updateDoc,terminate} from 'firebase/firestore';
import {seedFamily} from './emulator-admin';
import {saveMaterialBinding} from '../src/planning/material-binding-repository';
import {bindingCandidates,currentBinding,projectBinding} from '../src/planning/material-binding';
import {taskDisplayName} from '../src/planning/material-display';
import type {PlanningTask} from '../src/planning/model';
const endpoint=process.env.FIRESTORE_EMULATOR_HOST;
if(!endpoint||!/^127\.0\.0\.1:\d+$/.test(endpoint))throw Error('Local emulator required');
const client=(name:string,uid:string)=>{const app=initializeApp({projectId:'demo-study-v182',apiKey:'emulator-only'},name),db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',Number(endpoint.split(':')[1]),{mockUserToken:{sub:uid}});return {app,db};};
const one=client('binding-one','alice'),two=client('binding-two','alice'),bob=client('binding-bob','bob'),outsider=client('binding-out','outsider');
const family='binding-'+Date.now(),task:PlanningTask={id:'legacy',unit:'第12回',subject:'science',category:'プリント',materialName:'プリント - 確認テストA',title:'確認テストA',status:'in_progress',isRunning:false,history:[{duration:321,score:50}]};
const ref=(db=one.db)=>doc(db,'families',family,'tasks',task.id),load=async(db=one.db)=>({...((await getDocFromServer(ref(db))).data()),id:task.id}) as PlanningTask;
describe('display binding with unchanged production Rules',()=>{
 beforeAll(async()=>{await seedFamily(family,['alice','bob']);await setDoc(ref(),task);});
 afterAll(async()=>{await Promise.all([one,two,bob,outsider].map(async c=>{await terminate(c.db);await deleteApp(c.app);}));});
 it('saves only the binding and restores it on a second device for the same account',async()=>{
  const id=bindingCandidates(task).find(m=>m.difficulty==='ADVANCE')!.materialId;
  await saveMaterialBinding(one.db,family,'alice',task,0,id,()=>true);
  const other=await load(two.db),{materialDisplayBindings,...rest}=other;
  expect(rest).toEqual(task);expect(materialDisplayBindings?.alice.materialId).toBe(id);
  expect(taskDisplayName(projectBinding(other,currentBinding(other,'alice')))).toBe('確認テスト ADVANCE（火山と地震）');
  expect(currentBinding(other,'bob')).toBeNull();
 });
 it('isolates another member, preserves simultaneous task/history changes, and rejects stale saves',async()=>{
  const id=bindingCandidates(task)[0].materialId;
  await saveMaterialBinding(bob.db,family,'bob',task,0,id,()=>true);
  await updateDoc(ref(),{status:'completed',history:[{duration:999,score:100}]});
  await saveMaterialBinding(two.db,family,'alice',task,1,id,()=>true);
  const live=await load();expect(live.status).toBe('completed');expect(live.history).toEqual([{duration:999,score:100}]);
  expect(live.materialDisplayBindings?.bob.revision).toBe(1);expect(live.materialDisplayBindings?.alice.revision).toBe(2);
  await expect(saveMaterialBinding(one.db,family,'alice',task,1,id,()=>true)).rejects.toThrow(/更新/);
 });
 it('clears without losing other accounts, rejects account switches, scope changes and nonmembers',async()=>{
  await saveMaterialBinding(one.db,family,'alice',task,2,null,()=>true);
  const live=await load();expect(currentBinding(live,'alice')?.materialId).toBeNull();expect(currentBinding(live,'bob')?.materialId).not.toBeNull();
  await expect(saveMaterialBinding(one.db,family,'alice',task,3,null,()=>false)).rejects.toThrow(/利用者/);
  await updateDoc(ref(),{unit:'第11回'});
  await expect(saveMaterialBinding(one.db,family,'alice',task,3,null,()=>true)).rejects.toThrow(/登録情報/);
  await expect(saveMaterialBinding(outsider.db,family,'outsider',task,0,null,()=>true)).rejects.toMatchObject({code:'permission-denied'});
 });
});
