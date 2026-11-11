import { commitCalculationAttempt } from "../src/daily-calculation";
import { registerMaterial } from "../src/planning/material-repository";
import type { Material } from "../src/planning/materials";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeApp, deleteApp } from "firebase/app";
import { collection, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, getFirestore, setDoc, terminate, writeBatch } from "firebase/firestore";
import { seedFamily, seedReviewData } from "./emulator-admin";
import { answerQuestion, createReviewDraft, sampleQuestions } from "../src/review/model";
import { reviewCollection, saveReview } from "../src/review/repository";
import { emptyPlan, type TaskPlan } from "../src/planning/model";
import { saveTaskPlan } from "../src/planning/repository";
const endpoint=process.env.FIRESTORE_EMULATOR_HOST;
if(!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator required");
const family=`learning-${Date.now()}`, uid="learner-a";
const client=(user:string)=>{const app=initializeApp({projectId:"demo-study-v182",apiKey:"emulator-only"},crypto.randomUUID());const db=getFirestore(app);connectFirestoreEmulator(db,"127.0.0.1",Number(endpoint.split(":")[1]),{mockUserToken:{sub:user}});return {app,db};};
const a=client(uid), b=client(uid), other=client("learner-b"), outside=client("outside");
const plan:TaskPlan={...emptyPlan(),ranges:[{id:"r1",label:"1〜5ページ",units:5,minutes:10,day:"2026-11-11",done:true,graded:true,corrected:true,actualDay:"2026-11-11",actualSeconds:300}]};
const ref=()=>doc(a.db,"families",family,"tasks","original-task");
describe("learning planning transactions and practice Rules",()=>{
 beforeAll(async()=>{await seedFamily(family,[uid,"learner-b"]);await seedReviewData(family,uid,"questions",sampleQuestions);await setDoc(ref(),{id:"original-task",unit:"第11回",subject:"math",category:"練習",status:"in_progress",isRunning:false,history:[{id:"retained",duration:600}],currentDuration:0});});
 afterAll(async()=>{await Promise.all([a,b,other,outside].map(async c=>{await terminate(c.db);await deleteApp(c.app);}));});
 it("saves practice idempotently without creating or changing review progress",async()=>{
  const at=Date.now()-10000;let d=createReviewDraft(uid,[sampleQuestions[0]],"practice",at);d=answerQuestion(d,0,at+100);
  await Promise.all([saveReview(a.db,family,uid,d),saveReview(b.db,family,uid,d)]);
  expect((await getDocsFromServer(reviewCollection(a.db,family,uid,"attempts"))).size).toBe(1);
  expect((await getDocsFromServer(reviewCollection(a.db,family,uid,"progress"))).size).toBe(0);
  let daily=createReviewDraft(uid,[sampleQuestions[0]],"daily",at+200);daily=answerQuestion(daily,1,at+300);await saveReview(a.db,family,uid,daily);
  const progressRef=doc(reviewCollection(a.db,family,uid,"progress"),sampleQuestions[0].id), before=(await getDocFromServer(progressRef)).data();
  let next=createReviewDraft(uid,[sampleQuestions[0]],"practice",at+400);next=answerQuestion(next,0,at+500);await saveReview(a.db,family,uid,next);
  expect((await getDocFromServer(progressRef)).data()).toEqual(before);
  const bad=writeBatch(a.db);bad.set(doc(reviewCollection(a.db,family,uid,"attempts"),next.answers[0].id+"-bad"),{...next.answers[0],id:next.answers[0].id+"-bad"});
  await expect(bad.commit()).rejects.toMatchObject({code:"permission-denied"});
  await expect(saveReview(other.db,family,uid,next)).rejects.toMatchObject({code:"permission-denied"});
 });
 it("updates the original task with optimistic revision checking and no duplicate tasks",async()=>{
  const results=await Promise.allSettled([saveTaskPlan(a.db,family,"original-task",0,plan,()=>true),saveTaskPlan(b.db,family,"original-task",0,{...plan,endDay:"2026-11-12"},()=>true)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  const saved=(await getDocFromServer(ref())).data()!;
  expect(saved.history).toEqual([{id:"retained",duration:600}]);expect(saved.status).toBe("in_progress");expect(saved.planning.revision).toBe(1);
  expect((await getDocsFromServer(collection(a.db,"families",family,"tasks"))).size).toBe(1);
  await expect(saveTaskPlan(a.db,family,"original-task",1,{...plan,ranges:[{...plan.ranges[0],corrected:false}]},()=>true,true)).rejects.toThrow();
  await saveTaskPlan(a.db,family,"original-task",1,plan,()=>true,true);
  expect((await getDocFromServer(ref())).data()?.status).toBe("completed");
  await expect(saveTaskPlan(a.db,family,"missing",0,plan,()=>true)).rejects.toThrow("削除");
 });
 it("does not drop baseline history or rewrite a fixed baseline",async()=>{
  const baseline={id:"b1",createdDay:"2026-11-11",targetDay:"2026-11-12",daily:{"2026-11-12":100},evidence:{source:"fixture",count:0,firstSeconds:null,redoSeconds:null,redoDays:0,conditions:"fixture",manualMinutes:10,provisional:true}};
  await saveTaskPlan(a.db,family,"original-task",2,{...plan,baseline},()=>true);
  await expect(saveTaskPlan(a.db,family,"original-task",3,{...plan,baseline:{...baseline,targetDay:"2026-11-15"}},()=>true)).rejects.toThrow("維持");
  await saveTaskPlan(a.db,family,"original-task",3,{...plan,baseline,endDay:"2026-11-20"},()=>true);
  expect((await getDocFromServer(ref())).data()?.planning.baseline).toEqual(baseline);
  const next={...baseline,id:"b2",targetDay:"2026-11-13"};
  await saveTaskPlan(a.db,family,"original-task",4,{...plan,baseline:next,baselineHistory:[baseline]},()=>true);
  expect((await getDocFromServer(ref())).data()?.planning.baselineHistory).toEqual([baseline]);
 });
 it("limits availability settings to the authenticated family member",async()=>{
  const settings=doc(a.db,"families",family,"studyPlanning",uid);
  await setDoc(settings,{schemaVersion:1,capacities:{"2026-11-11":60}});
  expect((await getDocFromServer(settings)).data()?.capacities).toEqual({"2026-11-11":60});
  await expect(setDoc(doc(other.db,"families",family,"studyPlanning",uid),{schemaVersion:1,capacities:{}})).rejects.toMatchObject({code:"permission-denied"});
  await expect(getDocFromServer(doc(outside.db,"families",family,"tasks","original-task"))).rejects.toMatchObject({code:"permission-denied"});
 });
 it("registers material once, links existing tasks, and rejects duplicate PDF reuse",async()=>{
  const m:Material={materialId:'material-'+ 'a'.repeat(64),title:'追加プリント',unit:'第11回',subject:'math',category:'プリント',requirement:'reinforcement',references:[{name:'problem.pdf',sha256:'a'.repeat(64),role:'problem'},{name:'answer.pdf',sha256:'b'.repeat(64),role:'answer'}]};
  const ids=await Promise.all([registerMaterial(a.db,family,m,null,()=>true),registerMaterial(b.db,family,m,null,()=>true)]);expect(new Set(ids).size).toBe(1);
  const saved=await getDocFromServer(doc(a.db,'families',family,'tasks',m.materialId));expect(saved.data()?.planning.revision).toBe(1);
  await registerMaterial(a.db,family,m,null,()=>true);expect((await getDocFromServer(saved.ref)).data()?.planning.revision).toBe(1);
  await expect(registerMaterial(a.db,family,{...m,materialId:'material-'+'c'.repeat(64),references:[{name:'other.pdf',sha256:'c'.repeat(64),role:'problem'},m.references[1]]},null,()=>true)).rejects.toThrow('同じPDF');
  const linkedMaterial:Material={...m,materialId:'material-'+'e'.repeat(64),references:[{name:'linked.pdf',sha256:'e'.repeat(64),role:'problem'}]};
  await registerMaterial(a.db,family,linkedMaterial,'original-task',()=>true);expect((await getDocFromServer(ref())).data()?.planning.material.materialId).toBe(linkedMaterial.materialId);expect((await getDocFromServer(doc(a.db,'families',family,'tasks',linkedMaterial.materialId))).exists()).toBe(false);
  await expect(registerMaterial(outside.db,family,{...m,materialId:'material-'+'d'.repeat(64),references:[{name:'outside.pdf',sha256:'d'.repeat(64),role:'problem'}]},null,()=>true)).rejects.toMatchObject({code:'permission-denied'});
 });
 it("keeps scored-zero calculation targets and actuals separate without crediting study twice",async()=>{
  const taskRef=doc(a.db,'families',family,'tasks','calculation');await setDoc(taskRef,{unit:'第11回',subject:'math',category:'計算',history:[]});const at=Date.now()-10000;const d={id:'goal-zero-score',taskId:'calculation',taskLabel:'11/計算1',dateKey:new Date(at+32400000).toISOString().slice(0,10),score:0,elapsedSeconds:5,targetSeconds:3,operationCheck:true,startedAt:at,finishedAt:at+5000};
  const results=await Promise.all([commitCalculationAttempt(a.db,family,uid,d),commitCalculationAttempt(b.db,family,uid,d)]);expect(results[0]).toEqual(results[1]);expect(results[0]).toMatchObject({score:0,elapsedSeconds:5,targetSeconds:3,operationCheck:true,attemptNo:1});expect((await getDocFromServer(taskRef)).data()?.history).toEqual([]);
 });
});
