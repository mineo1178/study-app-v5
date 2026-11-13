import {auth} from './timer-client';
import {getFirestore,doc,getDoc,updateDoc} from 'firebase/firestore';
import {saveTaskPlan} from '../src/planning/repository';
import {editWbs} from '../src/planning/wbs';
import type {PlanningTask} from '../src/planning/model';
export async function verifyWbsTransactions(){
 if(auth.app.options.projectId!=='demo-study-hotfix'||!auth.currentUser)throw Error('Emulator only');
 const db=getFirestore(auth.app),ref=doc(db,'families/hotfix-study-family/tasks/lag-ahead'),old=(await getDoc(ref)).data()!,task={...old,id:'lag-ahead'} as PlanningTask,revision=task.planning!.revision,uid=auth.currentUser.uid;
 const next=editWbs(task,{startDay:'2026-11-10',endDay:'2026-11-12',progress:100},uid,Date.now());
 const results=await Promise.allSettled([saveTaskPlan(db,'hotfix-study-family',task.id,revision,next,()=>true),saveTaskPlan(db,'hotfix-study-family',task.id,revision,next,()=>true)]);
 if(results.filter(r=>r.status==='fulfilled').length!==1)throw Error('Concurrent edit overwrote revision');
 const saved=(await getDoc(ref)).data()!;
 for(const key of ['status','history','scheduleActuals'])if(JSON.stringify(saved[key])!==JSON.stringify(old[key]))throw Error('Actual modified: '+key);
 for(const key of ['ranges','baseline','baselineHistory'])if(JSON.stringify(saved.planning[key])!==JSON.stringify(old.planning[key]))throw Error('Baseline modified: '+key);
 let rejected=false;try{await saveTaskPlan(db,'hotfix-study-family',task.id,revision+1,{...next,revision:revision+1},()=>false);}catch{rejected=true;}if(!rejected)throw Error('Account switch allowed');
 return {concurrentRejected:true,accountSwitchRejected:true,actualPreserved:true,revision:saved.planning.revision};
}

export async function bumpRevision(){const db=getFirestore(auth.app),ref=doc(db,'families/hotfix-study-family/tasks/normal'),d=(await getDoc(ref)).data()!;await updateDoc(ref,{'planning.revision':d.planning.revision+1});}
export async function seedWbsProposal(){
 if(auth.app.options.projectId!=='demo-study-hotfix'||!auth.currentUser)throw Error('Emulator only');
 const {officialFixture}=await import('./official-fixture'),{accountKey,materialKey}=await import('../src/planning/schedule'),{referencePlan}=await import('../src/planning/schedule-reference'),{importSchedule}=await import('../src/planning/schedule-repository'),{addDays}=await import('../src/planning/model'),{getJstDay}=await import('../src/review/model');
 const db=getFirestore(auth.app),task={...(await getDoc(doc(db,'families/hotfix-study-family/tasks/round12-math'))).data(),id:'round12-math'} as PlanningTask,source=officialFixture(),today=getJstDay(Date.now()),binding=await accountKey(db.app.options.projectId!,'hotfix-study-family',auth.currentUser.uid);
 source.planId='wbs-proposal';source.planningPolicy.taskSchedules=[{taskId:task.id,unit:task.unit,subject:task.subject,category:task.category,materialName:task.materialName,materialId:materialKey(task),recommendedEndDate:addDays(today,3),phases:[{phase:'first_and_marking',day:addDays(today,1),minutes:25,conditional:false}]}];
 await importSchedule(db,'hotfix-study-family',{uid:auth.currentUser.uid,binding,active:()=>true},referencePlan(source,[task],null,binding));
}
