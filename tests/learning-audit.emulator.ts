import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore, setDoc, terminate, updateDoc, writeBatch } from "firebase/firestore";
import { seedFamily } from "./emulator-admin";
import { correctRangeInputs, emptyPlan, type TaskPlan } from "../src/planning/model";
import { saveTaskPlan } from "../src/planning/repository";
import { registerMaterial } from "../src/planning/material-repository";
import { materialInfo, type Material } from "../src/planning/materials";
const endpoint=process.env.FIRESTORE_EMULATOR_HOST;
if(!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint))throw new Error('Dedicated localhost emulator required');
const family='audit-'+Date.now(),uid='audit-member';
const client=(id:string)=>{const app=initializeApp({projectId:'demo-study-v182',apiKey:'emulator-only'},crypto.randomUUID());const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',Number(endpoint.split(':')[1]),{mockUserToken:{sub:id}});return{app,db};};
const a=client(uid),outside=client('outside'),other=client('other-member');
const ref=(id:string,who=a)=>doc(who.db,'families',family,'tasks',id);
const denied=(work:Promise<unknown>)=>expect(work).rejects.toMatchObject({code:'permission-denied'});
const m:Material={materialId:'material-'+'a'.repeat(64),title:'Audit print',unit:'第11回',subject:'math',category:'プリント',requirement:'reinforcement',references:[{name:'audit.pdf',sha256:'a'.repeat(64),role:'problem'}]};
const plan:TaskPlan={...emptyPlan(),ranges:[{id:'r',label:'1〜5',units:5,minutes:10,day:'2026-11-11',done:true,graded:true,corrected:false,actualDay:'2026-11-11',actualSeconds:60}],baseline:{id:'b1',createdDay:'2026-11-11',targetDay:'2026-11-12',daily:{'2026-11-12':100},evidence:{source:'fixture',count:0,firstSeconds:null,redoSeconds:null,redoDays:0,conditions:'fixture',manualMinutes:10,provisional:true}}};
describe('acceptance audit: Rules and correction transactions',()=>{
 beforeAll(async()=>{await seedFamily(family,[uid,'other-member']);});
 afterAll(async()=>{await Promise.all([a,outside,other].map(async c=>{await terminate(c.db);await deleteApp(c.app);}));});
 it('preserves legacy completion and timer history on planning save, failure and conflict',async()=>{
  const original={unit:'第11回',subject:'math',category:'book',status:'completed',isRunning:false,currentDuration:0,history:[{id:'legacy',duration:60,date:'11/1'}]};await setDoc(ref('legacy'),original);
  expect((await getDocFromServer(ref('legacy'))).data()).toEqual(original);
  await saveTaskPlan(a.db,family,'legacy',0,plan,()=>true);const saved=(await getDocFromServer(ref('legacy'))).data()!;expect(saved.status).toBe('completed');expect(saved.history).toEqual(original.history);
  await expect(saveTaskPlan(a.db,family,'legacy',0,{...plan,endDay:'2026-11-13'},()=>true)).rejects.toThrow('別の端末');expect((await getDocFromServer(ref('legacy'))).data()).toEqual(saved);
 });
 it('saves correction atomically and retries cannot append a second correction',async()=>{
  const old=(await getDocFromServer(ref('legacy'))).data()!.planning as TaskPlan;
  const next=correctRangeInputs(old,old.ranges.map(r=>({...r,units:6})),'作業量の入力訂正','correction-1','2026-11-11');
  await saveTaskPlan(a.db,family,'legacy',old.revision,next,()=>true);
  const saved=(await getDocFromServer(ref('legacy'))).data()!;expect(saved.planning.baseline).toBeNull();expect(saved.planning.baselineHistory).toEqual([plan.baseline]);expect(saved.planning.rangeCorrections).toHaveLength(1);expect(saved.status).toBe('completed');
  await expect(saveTaskPlan(a.db,family,'legacy',old.revision,next,()=>true)).rejects.toThrow('別の端末');expect((await getDocFromServer(ref('legacy'))).data()).toEqual(saved);
 });
 it('denies a raw task with unregistered material and a forged unit-to-task binding',async()=>{
  await denied(setDoc(ref('unregistered'),{unit:m.unit,subject:m.subject,planning:{...emptyPlan(),material:materialInfo(m)}}));
  const batch=writeBatch(a.db);batch.set(ref('wrong-scope'),{unit:'第12回',subject:'science',planning:{...emptyPlan(),material:materialInfo(m)}});batch.set(doc(a.db,'families',family,'studyMaterials',m.materialId),{taskId:'wrong-scope',materialId:m.materialId,unit:m.unit,subject:m.subject});await denied(batch.commit());expect((await getDocFromServer(ref('wrong-scope'))).exists()).toBe(false);
 });
 it('accepts correct registration but denies a second raw task using the same material',async()=>{
  await registerMaterial(a.db,family,m,null,()=>true);
  const saved=(await getDocFromServer(ref(m.materialId))).data()!;await denied(setDoc(ref('duplicate'),{...saved,title:'duplicate'}));
  await updateDoc(ref(m.materialId),{status:'completed'});expect((await getDocFromServer(ref(m.materialId))).data()?.status).toBe('completed');
  await registerMaterial(a.db,family,m,null,()=>true);expect((await getDocFromServer(ref(m.materialId))).data()?.planning.revision).toBe(1);
 });
 it('denies outside-family access and other-UID capacity writes with the new task rules',async()=>{
  await denied(getDocFromServer(ref('legacy',outside)));await denied(setDoc(ref('outside',outside),{title:'outside'}));await denied(setDoc(doc(other.db,'families',family,'studyPlanning',uid),{schemaVersion:1,capacities:{}}));
 });
 it('keeps old tasks with null planning readable and independently updatable',async()=>{
  await setDoc(ref('null-plan'),{subject:'math',planning:null,history:[]});await updateDoc(ref('null-plan'),{status:'completed'});expect((await getDocFromServer(ref('null-plan'))).data()?.planning).toBeNull();
 });
});
