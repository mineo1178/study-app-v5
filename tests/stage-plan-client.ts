import {auth} from './timer-client';
import {getFirestore,doc,getDoc,getDocs,collection,updateDoc} from 'firebase/firestore';
import {emptyPlan,addDays,type PlanningTask} from '../src/planning/model';
import {accountKey,parseSchedule} from '../src/planning/schedule';
import {oldItem,initialResolutions} from '../src/planning/official-schedule';
import {importSchedule} from '../src/planning/schedule-repository';
import type {OfficialPlan} from '../src/planning/official-schema';
export async function stagePlan(source:OfficialPlan){
 if(auth.app.options.projectId!=='demo-study-hotfix'||!auth.currentUser)throw Error('Emulator only');
 const db=getFirestore(auth.app),uid=auth.currentUser.uid,family='hotfix-study-family',ref=doc(db,'families',family,'tasks','candidate-s');await updateDoc(ref,{planning:emptyPlan()});
 const tasks=(await getDocs(collection(db,'families',family,'tasks'))).docs.map(d=>({...d.data(),id:d.id})) as PlanningTask[],task=tasks.find(t=>t.id==='candidate-s')!,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date()),binding=await accountKey(db.app.options.projectId!,family,uid),pointer=await getDoc(doc(db,'families',family,'learningSchedules',uid));
 const stages=[{phase:'first_and_marking',day:today,minutes:25,conditional:false},{phase:'correction',day:addDays(today,2),minutes:10,conditional:true},{phase:'final_check',day:addDays(today,3),minutes:2,conditional:false}] as const;
 source.planId='stage-priority';source.revision=2;source.planningPolicy.taskSchedules=[{...task,taskId:task.id,materialId:'legacy-'+task.id,recommendedEndDate:addDays(today,3),phases:stages}];delete (source.planningPolicy.taskSchedules[0] as Partial<PlanningTask>).history;delete (source.planningPolicy.taskSchedules[0] as Partial<PlanningTask>).planning;
 return parseSchedule(JSON.stringify({schemaVersion:'learning-schedule/1',planId:'stage-priority',revision:2,generatedAt:new Date().toISOString(),accountBinding:binding,baseVersion:pointer.data()?.versionId??null,provisional:true,notes:['工程だけの採用・仮見積'],gaps:['範囲・作業量は未測定'],scope:[{unit:'第11回',subjects:['math','japanese','science','social'],deadline:null}],capacities:{[today]:60},proposalImport:{source,records:initialResolutions(source,tasks,null)},items:[{...oldItem(task),endDay:addDays(today,3),deadline:null,ranges:[],dailyWork:{},stages}]}));
}
export async function stageProof(plan:ReturnType<typeof parseSchedule>){
 const db=getFirestore(auth.app),uid=auth.currentUser!.uid,binding=await accountKey(db.app.options.projectId!,'hotfix-study-family',uid),result=await importSchedule(db,'hotfix-study-family',{uid,binding,active:()=>true},plan),snap=await getDoc(doc(db,'families/hotfix-study-family/tasks/candidate-s')),versions=await getDocs(collection(db,'families','hotfix-study-family','learningSchedules',uid,'plans'));
 return {duplicate:result.duplicate,versions:versions.size,task:snap.data()};
}
