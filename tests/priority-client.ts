import {auth} from './timer-client';
import {doc,getDoc,getFirestore,setDoc} from 'firebase/firestore';
import {scheduleFixture,scheduleTask} from './schedule-fixture';
import {officialFixture} from './official-fixture';
import {accountKey,materialKey} from '../src/planning/schedule';
import {initialResolutions} from '../src/planning/official-schedule';
import {saveTaskPlan} from '../src/planning/repository';
import {reviseTarget} from '../src/planning/target-edit';
export async function priorityFixture(){
 if(auth.app.options.projectId!=='demo-study-hotfix'||!auth.currentUser)throw Error('Emulator only');
 const db=getFirestore(auth.app),plan=scheduleFixture(),source=officialFixture();
 const tasks=Array.from({length:10},(_,i)=>({...scheduleTask,id:'b-'+i,title:'B課題'+i,status:i===9?'completed' as const:'not_started' as const}));
 source.planId=plan.planId='priority-fixture';plan.accountBinding=await accountKey(db.app.options.projectId!,'hotfix-study-family',auth.currentUser.uid);plan.baseVersion=null;
 plan.items=tasks.map(task=>({...structuredClone(plan.items[0]),taskId:task.id,title:task.title,materialId:materialKey(task),ranges:[],dailyWork:{},baseline:{id:'unset',targetDay:null,daily:{},evidence:{provisional:true,historyCount:0,estimatedMinutes:null,method:'未測定',conditions:[],manualAdjustmentMinutes:null}},stages:task.status==='completed'?[]:[{phase:'first_and_marking' as const,day:'2026-11-12',minutes:10,conditional:false}]}));
 source.planningPolicy.adoptionDecision={status:'guardian_selected_priority_plan',selectedTaskIds:tasks.map(t=>t.id),completedTaskIds:['b-9'],pendingTaskIds:tasks.slice(0,9).map(t=>t.id)};
 source.planningPolicy.taskSchedules=plan.items.slice(0,9).map(item=>({...item,phases:structuredClone(item.stages),statusAtGeneration:'not_started',recommendedEndDate:item.endDay}));
 plan.proposalImport={source,records:initialResolutions(source,tasks,null)};
 for(const task of tasks)await setDoc(doc(db,'families/hotfix-study-family/tasks/'+task.id),task);
 return plan;
}
export async function verifyTargetPointer(){
 const db=getFirestore(auth.app),ref=doc(db,'families/hotfix-study-family/tasks/b-0'),task={...(await getDoc(ref)).data(),id:'b-0'} as typeof scheduleTask;
 const next=reviseTarget(task,[task],null,'2026-11-13','2026-11-19','標準の木曜期限','',Date.now());
 let rejected=false;try{await saveTaskPlan(db,'hotfix-study-family',task.id,next.revision,next,()=>true,false,{uid:auth.currentUser!.uid,versionId:'stale-plan--r0'});}catch{rejected=true;}
 if(!rejected)throw Error('Schedule pointer conflict accepted');
 if((await getDoc(ref)).data()?.planning)throw Error('Rejected target was saved');return true;
}
