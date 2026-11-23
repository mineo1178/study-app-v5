import { doc, runTransaction, type Firestore,type Transaction } from 'firebase/firestore';
import { taskWriteVersion, retryTaskWrite } from '../task-write';
import { actualOf,canonical,parseSchedule,scheduleDigest,scheduleErrors,scheduleMergeErrors,stageImportConflicts,type LearningSchedule,type ScheduleActual } from './schedule';
import type { PlanningTask } from './model';
import {isScheduleSyncState,type ScheduleSyncState} from './schedule-sync-state';
export type ScheduleOwner={uid:string;binding:string;active:()=>boolean};
export type SchedulePointer={schemaVersion:1;planId:string;revision:number;versionId:string;digest:string;generatedAt:string;importedAt:number};
export const scheduleRoot=(db:Firestore,family:string,uid:string)=>doc(db,'families',family,'learningSchedules',uid);
export const scheduleSyncRef=(db:Firestore,family:string,uid:string)=>doc(scheduleRoot(db,family,uid),'syncState','current');
export const scheduleCapacityRef=(db:Firestore,family:string,uid:string)=>doc(db,'families',family,'studyPlanning',uid);
export type ScheduleSyncFence={
 pointer:SchedulePointer|null; previous:ScheduleSyncState|null; next:ScheduleSyncState;
 capacities:unknown; taskDigests:ReadonlyMap<string,string>;
};
const changedDuringSync=()=>Error('同期中に計画・課題・学習可能時間が更新されました。最新状態から再照合してください。');
async function syncStateRefInTransaction(tx:Transaction,db:Firestore,family:string,uid:string,fence:ScheduleSyncFence){
 const ref=scheduleSyncRef(db,family,uid);
 const [prior,capacity]=await Promise.all([tx.get(ref),tx.get(scheduleCapacityRef(db,family,uid))]);
 if(canonical(prior.data()??null)!==canonical(fence.previous)||canonical(capacity.data()??null)!==canonical(fence.capacities)){
  throw changedDuringSync();
 }
 if(!isScheduleSyncState(fence.next))throw Error('同期状態の形式が不正です。');
 return ref;
}
export async function saveScheduleSyncState(db:Firestore,family:string,owner:ScheduleOwner,fence:ScheduleSyncFence){
 if(canonical(fence.previous)===canonical(fence.next))return false;
 return runTransaction(db,async tx=>{
  const [pointer,stateRef]=await Promise.all([tx.get(scheduleRoot(db,family,owner.uid)),syncStateRefInTransaction(tx,db,family,owner.uid,fence)]);
  if(!owner.active()||canonical(pointer.data()??null)!==canonical(fence.pointer)||fence.next.versionId!==(fence.pointer?.versionId??null))throw changedDuringSync();
  tx.set(stateRef,fence.next);
  return true;
 });
}
export function assertScheduleRevision(plan:LearningSchedule,digest:string,ledger:{revision:number;digest:string}|undefined){if(!ledger)return;if(plan.revision<ledger.revision)throw new Error('旧revisionは取り込めません。ローカルの計画ファイルを更新してください。');if(plan.revision===ledger.revision&&digest!==ledger.digest)throw new Error('同じrevisionの内容が変更されています。revisionを増やしてください。');}
export async function importSchedule(db:Firestore,family:string,owner:ScheduleOwner,input:LearningSchedule,sync?:ScheduleSyncFence){
 const plan=parseSchedule(JSON.stringify(input)),digest=await scheduleDigest(plan),versionId=plan.planId+'--r'+plan.revision;
 if(!!plan.sync!==!!sync)throw Error('自動同期の取込経路が一致しません。');
 if(!owner.active())throw new Error('利用者が切り替わりました。');
 const commit=()=>runTransaction(db,async tx=>{
  const root=scheduleRoot(db,family,owner.uid),version=doc(root,'plans',versionId),ledger=doc(root,'ledgers',plan.planId);
  const [pointer,existing,watermark,...snapshots]=await Promise.all([tx.get(root),tx.get(version),tx.get(ledger),...plan.items.map(i=>tx.get(doc(db,'families',family,'tasks',i.taskId)))]);
  if(!owner.active())throw new Error('利用者が切り替わりました。');
  const live=snapshots.filter(s=>s.exists()&&!s.data()._deletion);
  const tasks=live.map(s=>({...s.data(),id:s.id,history:s.data()?.history??[]}) as PlanningTask);
  let syncRef:ReturnType<typeof scheduleSyncRef>|undefined;
  let previousPlan:LearningSchedule|null=null;
  if(sync){
   if(canonical(pointer.data()??null)!==canonical(sync.pointer)||sync.next.versionId!==versionId||
     live.length!==sync.taskDigests.size||live.some(s=>canonical(s.data())!==sync.taskDigests.get(s.id)))throw changedDuringSync();
   syncRef=await syncStateRefInTransaction(tx,db,family,owner.uid,sync);
   if(sync.pointer){
    const previous=await tx.get(doc(root,'plans',sync.pointer.versionId));
    if(!previous.exists())throw changedDuringSync();
    previousPlan=parseSchedule(JSON.stringify(previous.data().plan));
    if(await scheduleDigest(previousPlan)!==sync.pointer.digest)throw changedDuringSync();
   }
  }
  const errors=sync?scheduleMergeErrors(plan,tasks,previousPlan,owner.binding):scheduleErrors(plan,tasks,owner.binding);
  if(errors.length)throw new Error(errors.join('\n'));
  assertScheduleRevision(plan,digest,watermark.exists()?watermark.data() as {revision:number;digest:string}:undefined);
  if(existing.exists()){
   if(existing.data().digest!==digest)throw new Error('同じrevisionの保存済み内容と一致しません。');
   if(pointer.data()?.versionId!==versionId)throw new Error('このrevisionは旧計画履歴です。新revisionで取り込んでください。');
   return{duplicate:true,versionId};
  }
  if(plan.proposalImport&&(pointer.data()?.versionId??null)!==plan.baseVersion)throw new Error('採用済み計画が更新されています。最新計画から照合プレビューを作り直してください。');
  if(!sync&&plan.items.some(i=>i.stages?.length)&&pointer.exists()){
   const previous=await tx.get(doc(root,'plans',pointer.data().versionId));
   const conflicts=stageImportConflicts(plan,previous.data()?.plan??null);
   if(conflicts.length)throw new Error(conflicts.join('\n'));
  }
  const importedAt=Date.now(),meta:SchedulePointer={schemaVersion:1,planId:plan.planId,revision:plan.revision,versionId,digest,generatedAt:plan.generatedAt,importedAt};
  if(!owner.active())throw new Error('利用者が切り替わりました。');
  tx.set(version,{plan,digest,importedAt});tx.set(ledger,{revision:plan.revision,digest});tx.set(root,meta);
  if(syncRef&&sync)tx.set(syncRef,sync.next);
  return{duplicate:false,versionId};
 });
 // An immutable-version rule can reject the losing concurrent create before
 // Firestore returns a transaction conflict. Re-read once under the same rules.
 try{return await commit();}catch(error){if((error as {code?:string}).code==='permission-denied'&&owner.active())return commit();throw error;}
}
export async function recordScheduleActual(db:Firestore,family:string,owner:ScheduleOwner,versionId:string,taskId:string,rangeId:string,patch:Partial<Pick<ScheduleActual,'done'|'graded'|'corrected'>>,today:string){
 if(!owner.active())throw new Error('利用者が切り替わりました。');
 return retryTaskWrite(() => runTransaction(db,async tx=>{
  const root=scheduleRoot(db,family,owner.uid),taskRef=doc(db,'families',family,'tasks',taskId);
  const [pointer,version,task]=await Promise.all([tx.get(root),tx.get(doc(root,'plans',versionId)),tx.get(taskRef)]);
  if(!owner.active())throw new Error('利用者が切り替わりました。');
  if(pointer.data()?.versionId!==versionId||!version.exists())throw new Error('計画が更新されました。最新の計画を確認してください。');
  if(!task.exists()||task.data()._deletion)throw new Error('タスクが削除されています。');
  const plan=parseSchedule(JSON.stringify(version.data().plan)),item=plan.items.find(i=>i.taskId===taskId),saved={...task.data(),id:taskId,history:task.data().history??[]} as PlanningTask;
  if(!item?.ranges.some(r=>r.id===rangeId)||scheduleErrors({...plan,items:[item]},[saved],owner.binding).length)throw new Error('範囲と既存taskIdの対応を確認してください。');
  const old=actualOf(saved,rangeId),flags={done:patch.done??old?.done??false,graded:patch.graded??old?.graded??false,corrected:patch.corrected??old?.corrected??false},actual:ScheduleActual={...flags,label:item.ranges.find(r=>r.id===rangeId)!.label,units:item.ranges.find(r=>r.id===rangeId)!.units,actualDay:flags.done?(old?.actualDay??today):null,recordedAt:Date.now()};
  tx.update(taskRef,{['scheduleActuals.'+rangeId]:actual,_writeVersion:taskWriteVersion(task.data())});return actual;
 }));
}
