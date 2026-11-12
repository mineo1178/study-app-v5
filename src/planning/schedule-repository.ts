import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { actualOf, parseSchedule, scheduleDigest, scheduleErrors, type LearningSchedule, type ScheduleActual } from './schedule';
import type { PlanningTask } from './model';
export type ScheduleOwner={uid:string;binding:string;active:()=>boolean};
export type SchedulePointer={schemaVersion:1;planId:string;revision:number;versionId:string;digest:string;generatedAt:string;importedAt:number};
export const scheduleRoot=(db:Firestore,family:string,uid:string)=>doc(db,'families',family,'learningSchedules',uid);
export function assertScheduleRevision(plan:LearningSchedule,digest:string,ledger:{revision:number;digest:string}|undefined){if(!ledger)return;if(plan.revision<ledger.revision)throw new Error('旧revisionは取り込めません。ローカルの計画ファイルを更新してください。');if(plan.revision===ledger.revision&&digest!==ledger.digest)throw new Error('同じrevisionの内容が変更されています。revisionを増やしてください。');}
export async function importSchedule(db:Firestore,family:string,owner:ScheduleOwner,input:LearningSchedule){
 const plan=parseSchedule(JSON.stringify(input)),digest=await scheduleDigest(plan),versionId=plan.planId+'--r'+plan.revision;
 if(!owner.active())throw new Error('利用者が切り替わりました。');
 const commit=()=>runTransaction(db,async tx=>{
  const root=scheduleRoot(db,family,owner.uid),version=doc(root,'plans',versionId),ledger=doc(root,'ledgers',plan.planId);
  const [pointer,existing,watermark,...snapshots]=await Promise.all([tx.get(root),tx.get(version),tx.get(ledger),...plan.items.map(i=>tx.get(doc(db,'families',family,'tasks',i.taskId)))]);
  if(!owner.active())throw new Error('利用者が切り替わりました。');
  const tasks=snapshots.filter(s=>s.exists()).map(s=>({...s.data(),id:s.id,history:s.data().history??[]}) as PlanningTask),errors=scheduleErrors(plan,tasks,owner.binding);
  if(errors.length)throw new Error(errors.join('\n'));
  assertScheduleRevision(plan,digest,watermark.exists()?watermark.data() as {revision:number;digest:string}:undefined);
  if(existing.exists()){
   if(existing.data().digest!==digest)throw new Error('同じrevisionの保存済み内容と一致しません。');
   if(pointer.data()?.versionId!==versionId)throw new Error('このrevisionは旧計画履歴です。新revisionで取り込んでください。');
   return{duplicate:true,versionId};
  }
  if(plan.proposalImport&&(pointer.data()?.versionId??null)!==plan.baseVersion)throw new Error('採用済み計画が更新されています。最新計画から照合プレビューを作り直してください。');
  const importedAt=Date.now(),meta:SchedulePointer={schemaVersion:1,planId:plan.planId,revision:plan.revision,versionId,digest,generatedAt:plan.generatedAt,importedAt};
  tx.set(version,{plan,digest,importedAt});tx.set(ledger,{revision:plan.revision,digest});tx.set(root,meta);
  return{duplicate:false,versionId};
 });
 // An immutable-version rule can reject the losing concurrent create before
 // Firestore returns a transaction conflict. Re-read once under the same rules.
 try{return await commit();}catch(error){if((error as {code?:string}).code==='permission-denied'&&owner.active())return commit();throw error;}
}
export async function recordScheduleActual(db:Firestore,family:string,owner:ScheduleOwner,versionId:string,taskId:string,rangeId:string,patch:Partial<Pick<ScheduleActual,'done'|'graded'|'corrected'>>,today:string){
 if(!owner.active())throw new Error('利用者が切り替わりました。');
 return runTransaction(db,async tx=>{
  const root=scheduleRoot(db,family,owner.uid),taskRef=doc(db,'families',family,'tasks',taskId);
  const [pointer,version,task]=await Promise.all([tx.get(root),tx.get(doc(root,'plans',versionId)),tx.get(taskRef)]);
  if(!owner.active())throw new Error('利用者が切り替わりました。');
  if(pointer.data()?.versionId!==versionId||!version.exists())throw new Error('計画が更新されました。最新の計画を確認してください。');
  if(!task.exists())throw new Error('タスクが削除されています。');
  const plan=parseSchedule(JSON.stringify(version.data().plan)),item=plan.items.find(i=>i.taskId===taskId),saved={...task.data(),id:taskId,history:task.data().history??[]} as PlanningTask;
  if(!item?.ranges.some(r=>r.id===rangeId)||scheduleErrors({...plan,items:[item]},[saved],owner.binding).length)throw new Error('範囲と既存taskIdの対応を確認してください。');
  const old=actualOf(saved,rangeId),flags={done:patch.done??old?.done??false,graded:patch.graded??old?.graded??false,corrected:patch.corrected??old?.corrected??false},actual:ScheduleActual={...flags,label:item.ranges.find(r=>r.id===rangeId)!.label,units:item.ranges.find(r=>r.id===rangeId)!.units,actualDay:flags.done?(old?.actualDay??today):null,recordedAt:Date.now()};
  tx.update(taskRef,{['scheduleActuals.'+rangeId]:actual});return actual;
 });
}
