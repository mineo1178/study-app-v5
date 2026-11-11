import { answerQuestion, createReviewDraft, nextProgress, sampleQuestions, type Progress } from '../src/review/model';
import { reviewCollection, saveReview } from '../src/review/repository';
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const collision=vi.hoisted(()=>({path:'',primary:'',arrivals:new Set<string>(),versions:[] as number[],attempts:new Map<string,number>(),both:Promise.resolve(),committed:Promise.resolve(),releaseBoth:()=>{},releaseCommit:()=>{}}));
vi.mock('firebase/firestore',async importOriginal=>{
 const real=await importOriginal<typeof import('firebase/firestore')>();
 return {...real,runTransaction:((db,work,options)=>real.runTransaction(db,async tx=>{
  const who=db.app.name;collision.attempts.set(who,(collision.attempts.get(who)??0)+1);
  const guarded=new Proxy(tx,{get(target,key){if(key==='get')return async(ref:import('firebase/firestore').DocumentReference)=>{const snapshot=await target.get(ref);if(ref.path===collision.path&&!collision.arrivals.has(who)){collision.arrivals.add(who);collision.versions.push(snapshot.data()?.planning?.revision??0);if(collision.arrivals.size===2)collision.releaseBoth();await collision.both;if(who!==collision.primary)await collision.committed;}return snapshot;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  return work(guarded);
 },options).finally(()=>{if(db.app.name===collision.primary)collision.releaseCommit();})) as typeof real.runTransaction};
});
import { deleteApp, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore, setDoc, terminate, writeBatch } from 'firebase/firestore';
import { seedFamily, seedReviewData } from './emulator-admin';
import { emptyPlan } from '../src/planning/model';
import { registerMaterial } from '../src/planning/material-repository';
import { saveTaskPlan } from '../src/planning/repository';
import type { Material } from '../src/planning/materials';
const endpoint=process.env.FIRESTORE_EMULATOR_HOST;if(!endpoint||!/^127\.0\.0\.1:\d+$/.test(endpoint))throw new Error('Dedicated localhost emulator required');
const family='release-race-'+Date.now(),uid='race-member';
const client=(identity=uid)=>{const app=initializeApp({projectId:'demo-study-v182',apiKey:'emulator-only'},crypto.randomUUID()),db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',Number(endpoint.split(':')[1]),{mockUserToken:{sub:identity}});return{app,db};};
const a=client(),b=client(),other=client('other-member');
describe('release: actual material/plan transaction collision',()=>{
 beforeAll(()=>seedFamily(family,[uid,'other-member']));afterAll(async()=>{await Promise.all([a,b,other].map(async c=>{await terminate(c.db);await deleteApp(c.app);}));});
 for(const first of ['plan','material'] as const)it(first+' commits first without losing planning or duplicating material',async()=>{
  const id='race-'+first,ref=doc(a.db,'families',family,'tasks',id),plan={...emptyPlan(),endDay:'2026-11-15'};
  await setDoc(ref,{unit:'第11回',subject:'math',category:'教材',status:'in_progress',history:[{id:'old',duration:60}],planning:plan});
  const m:Material={materialId:'material-'+(first==='plan'?'c':'d').repeat(64),title:'race fixture',unit:'第11回',subject:'math',category:'プリント',requirement:'reinforcement',references:[{name:'fixture.pdf',sha256:(first==='plan'?'c':'d').repeat(64),role:'problem'}]};
  collision.path=ref.path;collision.primary=first==='plan'?a.app.name:b.app.name;collision.arrivals.clear();collision.versions=[];collision.attempts.clear();collision.both=new Promise<void>(resolve=>{collision.releaseBoth=resolve;});collision.committed=new Promise<void>(resolve=>{collision.releaseCommit=resolve;});
  const results=await Promise.allSettled([saveTaskPlan(a.db,family,id,0,{...plan,endDay:'2026-11-20'},()=>true),registerMaterial(b.db,family,m,id,()=>true)]);
  expect(collision.versions).toEqual([0,0]);const saved=(await getDocFromServer(ref)).data()!;
  expect(saved.history).toEqual([{id:'old',duration:60}]);expect(saved.planning.material.materialId).toBe(m.materialId);
  if(first==='plan'){expect(results.every(r=>r.status==='fulfilled')).toBe(true);expect(saved.planning).toMatchObject({revision:2,endDay:'2026-11-20'});}
  else{expect(results[0].status).toBe('rejected');expect(results[1].status).toBe('fulfilled');expect(saved.planning).toMatchObject({revision:1,endDay:'2026-11-15'});}
  const before=structuredClone(saved.planning);await registerMaterial(b.db,family,m,id,()=>true);expect((await getDocFromServer(ref)).data()?.planning).toEqual(before);
  expect((await getDocFromServer(doc(a.db,'families',family,'studyMaterials',m.materialId))).data()?.taskId).toBe(id);
  collision.path='';
 });
 it('denies reading another UID capacity document',async()=>{
  await setDoc(doc(a.db,'families',family,'studyPlanning',uid),{schemaVersion:1,capacities:{'2026-11-11':60}});
  await expect(getDocFromServer(doc(other.db,'families',family,'studyPlanning',uid))).rejects.toMatchObject({code:'permission-denied'});
 });
 it('saves ordinary review, rejects paired practice progress atomically, and accepts history-only practice',async()=>{
  const q=sampleQuestions[0],at=Date.now()-5000;await seedReviewData(family,uid,'questions',[q]);
  const daily=answerQuestion(createReviewDraft(uid,[q],'daily',at),q.correctIndex,at+100);await saveReview(a.db,family,uid,daily);
  const progressRef=doc(reviewCollection(a.db,family,uid,'progress'),q.id),before=(await getDocFromServer(progressRef)).data() as Progress;
  const practice=answerQuestion(createReviewDraft(uid,[q],'practice',at+200),q.correctIndex,at+300),answer=practice.answers[0],attemptRef=doc(reviewCollection(a.db,family,uid,'attempts'),answer.id);
  const bad=writeBatch(a.db);bad.set(attemptRef,answer);bad.set(progressRef,{...nextProgress(before,{...answer,mode:'daily'}),latestMode:'practice'});await expect(bad.commit()).rejects.toMatchObject({code:'permission-denied'});expect((await getDocFromServer(attemptRef)).exists()).toBe(false);expect((await getDocFromServer(progressRef)).data()).toEqual(before);
  await saveReview(a.db,family,uid,practice);expect((await getDocFromServer(attemptRef)).data()?.mode).toBe('practice');expect((await getDocFromServer(progressRef)).data()).toEqual(before);
 });
});
