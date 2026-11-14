import {doc,getDoc,getDocs,getFirestore,collection,writeBatch} from 'firebase/firestore';
import {auth} from './timer-client';
import {importSchedule} from '../src/planning/schedule-repository';
import {accountKey,materialKey,type LearningSchedule} from '../src/planning/schedule';
import type {PlanningTask} from '../src/planning/model';
import {seedDashboard} from './dashboard-client';
import {DEFAULT_CALENDAR,type EventCalendar} from '../src/planning/events';
import {emptyPlan} from '../src/planning/model';
const root='families/hotfix-study-family';
function database(){if(location.hostname!=='127.0.0.1'||auth.app.options.projectId!=='demo-study-hotfix')throw Error('Emulator only');return getFirestore(auth.app);}
export async function seedAlerts(){
 await seedDashboard();const db=database(),batch=writeBatch(db);
 const descriptors=[['normal','プリント','確認テストS'],['dashboard-4','演習問題集','発展問題'],['dashboard-8','予習シリーズ','基本問題'],['dashboard-12','計算','②'],['dashboard-16','演習問題集','基本問題'],['dashboard-20','プリント','確認テストB'],['dashboard-24','プリント','確認テストA'],['dashboard-28','練成問題','練習問題'],['dashboard-32','漢字とことば','漢字練習'],['dashboard-36','市販問題集','復習'],['dashboard-40','その他','不明'],['dashboard-44','プリント','計算テストA']];
 for(const [id,category,title]of descriptors)batch.update(doc(db,root,'tasks',id),{category,title,materialName:category+' - '+title});await batch.commit();
 const uid=auth.currentUser!.uid,pointer=(await getDoc(doc(db,root,'learningSchedules',uid))).data()!,plan=structuredClone((await getDoc(doc(db,root,'learningSchedules',uid,'plans',pointer.versionId))).data()!.plan) as LearningSchedule;
 const tasks=(await getDocs(collection(db,root,'tasks'))).docs.map(d=>({...d.data(),id:d.id}) as PlanningTask);plan.revision++;plan.generatedAt=new Date().toISOString();plan.scope=plan.scope.map(s=>({...s,deadline:null}));plan.items=plan.items.map(i=>{const task=tasks.find(t=>t.id===i.taskId)!;return{...i,deadline:null,category:task.category,materialName:task.materialName,title:task.title,materialId:materialKey(task)};});
 const binding=await accountKey(db.app.options.projectId!, 'hotfix-study-family',uid);await importSchedule(db,'hotfix-study-family',{uid,binding,active:()=>true},plan);
}
export function colorFixture():EventCalendar{
 const at='2026-11-14T12:00:00+09:00',c={...structuredClone(DEFAULT_CALENDAR),calendarId:'alert-colors',generatedAt:at};
 c.events.push({...c.events[0],eventId:'lesson20',kind:'lesson',day:'2026-11-20',name:'通常授業（テスト用）',label:'授業',updatedAt:at});
 c.events.push({...c.events[0],eventId:'lesson21',kind:'lesson',name:'同日の授業（テスト用）',label:'授業',updatedAt:at});
 c.events.push({...c.events[0],eventId:'placement22',kind:'placement',day:'2026-11-22',name:'組分けテスト（テスト用）',label:'組分けテスト',updatedAt:at});return c;
}
export async function setScenario(kind:'near'|'delayed'|'unknown'|'within'){
 const db=database(),tasks=await getDocs(collection(db,root,'tasks')),normal=(await getDoc(doc(db,root,'tasks','normal'))).data()!,batch=writeBatch(db);
 for(const task of tasks.docs)batch.update(task.ref,{status:task.id==='normal'?'in_progress':'completed'});
 const planning={...emptyPlan(),...normal.planning,deadline:kind==='unknown'?'':kind==='near'?'2026-11-17':'2026-12-01'};
 planning.questionPlan={...planning.questionPlan,scopeId:kind==='delayed'?'scope-normal':'unmatched-scope'};
 batch.update(doc(db,root,'tasks','normal'),{unit:'第13回',planning});await batch.commit();
}
