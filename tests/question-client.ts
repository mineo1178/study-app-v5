import {auth} from './timer-client';
import {doc,getDoc,getFirestore} from 'firebase/firestore';
import {saveTaskPlan} from '../src/planning/repository';
import {updateQuestion,type QuestionPlan} from '../src/planning/question-progress';
import type {PlanningTask} from '../src/planning/model';
export async function seedQuestionPlan(){
 if(auth.app.options.projectId!=='demo-study-hotfix')throw Error('Emulator only');
 const db=getFirestore(auth.app),ref=doc(db,'families/hotfix-study-family/tasks/normal'),task={...(await getDoc(ref)).data(),id:'normal'} as PlanningTask;
 const p:QuestionPlan={scopeId:'qs-normal',label:'問題1〜10',total:10,confirmed:true,weights:{first:1,grading:1,mastery:1,confirmed:true,basis:'provisional_equal'},daily:{'2026-11-13':{first:10,grading:8,mastery:0},'2026-11-19':{first:0,grading:2,mastery:10}}};
 const next=updateQuestion(task,{plan:p},Date.now());await saveTaskPlan(db,'hotfix-study-family','normal',next.revision,next,()=>true);
}
