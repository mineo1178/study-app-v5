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
