import {DEFAULT_CALENDAR} from './events';
import {bookedScheduleMinutes} from './gantt-display';
import {prepareScheduleFile} from './import-file';
import type {PlanningTask} from './model';
import {oldItem} from './official-schedule';
import {AUTO_SCHEDULE_ID,type ScheduleSyncState,type SyncDecision,type SyncSource} from './schedule-sync-state';
import {actualOf,canonical,materialKey,type LearningSchedule,type ScheduleItem} from './schedule';

export type SyncTask={task:PlanningTask;createdAt:number;updatedAt:number};
export type SyncClassification={
 taskId:string;unit:string;title:string;
 kind:'A'|'B'|'C'|'D';outcome:'applied'|'retained'|'unplaced'|'waiting'|'held';reason:string;
};
type SyncInput={
 candidate:LearningSchedule;source:SyncSource;observedAt:number;
 current:LearningSchedule|null;previous:ScheduleSyncState|null;autoRevision:number;
 tasks:SyncTask[];targetRounds:string[];confirmedCapacities:Record<string,number>;binding:string;today:string;now:number;
};

const versionId=(plan:LearningSchedule|null)=>plan?plan.planId+'--r'+plan.revision:null;
const hasDate=(item:ScheduleItem|undefined)=>!!item&&(!!item.endDay||Object.keys(item.dailyWork).length>0||!!item.stages?.length);
const dates=(item:ScheduleItem)=>item.stages?.length?item.stages:item.ranges;
const historicalSlots=(item:ScheduleItem)=>dates(item).filter(r=>r.day).map(r=>[r.day,r.minutes].join(':')).sort();

function sameHistoricalSlots(old:ScheduleItem,proposed:ScheduleItem,today:string){
 return old.endDay===proposed.endDay&&old.deadline===proposed.deadline&&dates(old).every(r=>!r.day||r.day<today)
  &&canonical(historicalSlots(old))===canonical(historicalSlots(proposed))&&canonical(old.baseline)===canonical(proposed.baseline);
}

export function tutorScheduleProtection(task:PlanningTask,item:ScheduleItem,old?:ScheduleItem){
 const planning=task.planning;
 if(task.status==='completed')return '完了済み課題';
 if(task.isRunning||(task.currentDuration??0)>0)return '学習タイマーが進行中';
 if(planning?.wbs?.startDay||planning?.wbs?.endDay||planning?.endDay||planning?.ranges?.some(r=>r.day)
   ||planning?.questionPlan?.confirmed)return '手動予定・採用済み日別数量を保持';
 if(old?.stages?.length)return '採用済みの工程を保持';
 if([...(old?.ranges??[]),...item.ranges].some(r=>{const a=actualOf(task,r.id);return a&&(a.done||a.graded||a.corrected||a.actualDay);})){
  return '既存の範囲実績・採点・直しを保持';
 }
 return '';
}

function heldReason(entry:SyncTask,item:ScheduleItem,old:ScheduleItem|undefined,input:SyncInput){
 const {task,createdAt,updatedAt}=entry,planning=task.planning;
 if(task.status==='completed'||task.isRunning||(task.currentDuration??0)>0)return tutorScheduleProtection(task,item,old);
 const freshRegistration=createdAt>input.observedAt&&createdAt===updatedAt&&task.status==='not_started'&&!task.history.length&&!Object.keys(task.scheduleActuals??{}).length;
 if(updatedAt>input.observedAt&&!freshRegistration)return '計画作成後に課題・実績が更新された';
 const protectedReason=tutorScheduleProtection(task,item,old);
 if(protectedReason)return protectedReason;
 const scoped=input.current?.scope.find(s=>s.unit===item.unit&&s.subjects.includes(item.subject))?.deadline;
 const roundDeadline=DEFAULT_CALENDAR.deadlines.find(s=>s.unit===item.unit&&s.confirmed)?.day;
 const fixed=[planning?.deadline,old?.deadline,scoped,roundDeadline].filter(Boolean) as string[];
 if(item.deadline&&fixed.some(d=>d!==item.deadline))return '確定期限と候補の期限が競合';
 const days=Object.keys(item.dailyWork);
 if(days.some(day=>day<input.today))return '候補に過去の予定日が含まれる';
 if([...days,...(item.endDay?[item.endDay]:[])].some(day=>[...fixed,item.deadline].some(deadline=>deadline&&day>deadline)))return '候補の予定が確定期限を超える';
 if(!days.length)return '日付のない候補は未配置として保持';
 return '';
}

export function mergeTutorSchedule(input:SyncInput){
 const {candidate,current,source,previous,tasks,binding,today,now}=input;
 const currentVersion=versionId(current);
 const replay=previous?.source?.revision===source.revision;
 const capacityOnly=!candidate.items.length;
 if(candidate.accountBinding!==binding||source.planId!==candidate.planId||source.revision!==candidate.revision||
    source.baseVersion!==(candidate.baseVersion??null)||candidate.sync||candidate.proposalImport||
    candidate.confirmedCapacityDays!==undefined||candidate.items.some(i=>i.stages?.length)){
  throw Error('公開元・認証アカウント・日別範囲の計画形式を確認してください。');
 }
 if(previous?.source&&(previous.source.planId!==source.planId||previous.source.revision>source.revision||
   replay&&canonical(previous.source)!==canonical(source))){
  throw Error('旧revision・異なる計画系列・同じrevisionの内容変更を拒否しました。');
 }
 if(replay?previous.versionId!==currentVersion:source.baseVersion!==currentVersion){
  throw Error('採用元revisionが現在の本番と一致しません。最新計画から再作成してください。');
 }
 if(capacityOnly&&!current)throw Error('学習可能時間の訂正には採用済み計画が必要です。');
 const currentItems=new Map(current?.items.map(i=>[i.taskId,i]));
 const proposed=new Map(candidate.items.map(i=>[i.taskId,i]));
 const live=new Map(tasks.map(e=>[e.task.id,e]));
 const nextItems=new Map(currentItems);
 const appliedAlready=new Set(replay?previous.appliedTaskIds:[]);
 const waitingAlready=new Set(replay?previous.waitingTaskIds:[]);
 const classifications:SyncClassification[]=[];
 const decisions:SyncDecision[]=[];
 const changed:ScheduleItem[]=[];
 const classify=(i:Pick<ScheduleItem,'taskId'|'unit'|'title'>,kind:SyncClassification['kind'],outcome:SyncClassification['outcome'],reason:string)=>{
  classifications.push({taskId:i.taskId,unit:i.unit,title:i.title,kind,outcome,reason});
  if(outcome==='applied'||outcome==='waiting'||outcome==='held')decisions.push({taskId:i.taskId,kind:outcome,reason});
 };
 for(const item of candidate.items){
  const entry=live.get(item.taskId),old=currentItems.get(item.taskId);
  if(!entry){classify(item,'C','waiting','本番に一致するtaskIdの登録待ち');continue;}
  const {task}=entry;
  if(item.unit!==task.unit||item.subject!==task.subject||item.category!==task.category||
     item.materialName!==task.materialName||item.materialId!==materialKey(task)||item.title!==task.title){
   classify(item,'D','held','回・教科・教材または課題名が一致しない');continue;
  }
  if(appliedAlready.has(item.taskId)||old&&(canonical(item)===canonical(old)||sameHistoricalSlots(old,item,today))){
   classify(item,'A','retained','同じ予定を保持');continue;
  }
  if(!input.targetRounds.includes(item.unit)){classify(item,'D','held','公開対象回に含まれない');continue;}
  const reason=heldReason(entry,item,old,input)||
   (replay&&!waitingAlready.has(item.taskId)?'保留解除には新しい家庭教師revisionが必要':'');
  if(reason){classify(item,'D','held',reason);continue;}
  const next:ScheduleItem={...item,deadline:old?old.deadline:item.deadline,baseline:old?.baseline??oldItem(task).baseline};
  delete next.questionGoalCandidate;
  if(old?.questionPlan)next.questionPlan=old.questionPlan;
  else delete next.questionPlan;
  nextItems.set(item.taskId,next);
  changed.push(next);
  classify(item,'A','applied','一致した最新課題の日別範囲を統合');
 }
 for(const {task} of tasks){
  if(proposed.has(task.id))continue;
  const hasPlan=hasDate(currentItems.get(task.id))||hasDate(oldItem(task))||!!task.planning?.wbs?.startDay||!!task.planning?.wbs?.endDay;
  classify({taskId:task.id,unit:task.unit,title:task.title},'B',hasPlan||task.status==='completed'?'retained':'unplaced',hasPlan?'既存予定を保持':task.status==='completed'?'完了済み課題を保持':'今回の候補に予定なし');
 }
 const touchedDays=new Set(changed.flatMap(i=>Object.keys(i.dailyWork)));
 const oldCapacities=current?.capacities??{};
 const capacities={...oldCapacities};
 const oldConfirmedDays=current?.confirmedCapacityDays??[];
 const confirmedDays=new Set(oldConfirmedDays);
 const capacityDays=new Set([...touchedDays,...Object.keys(candidate.capacities).filter(day=>day>=today)]);
 for(const day of capacityDays){
  const confirmed=input.confirmedCapacities[day];
  const limit=confirmed??candidate.capacities[day]??oldCapacities[day];
  if(limit!==undefined)capacities[day]=limit;
  if(confirmed!==undefined)confirmedDays.add(day);
  else confirmedDays.delete(day);
 }
 const confirmedCapacityDays=[...confirmedDays].sort();
 const capacityChanged=canonical(capacities)!==canonical(oldCapacities)||
  canonical(confirmedCapacityDays)!==canonical(oldConfirmedDays);
 const savePlan=changed.length>0||capacityOnly&&!replay&&capacityChanged;
 if(savePlan){
  const booked=bookedScheduleMinutes(tasks.map(entry=>entry.task),nextItems.values());
  for(const day of capacityDays){
   if(!touchedDays.has(day)&&capacities[day]===oldCapacities[day])continue;
   const limit=capacities[day];
   if(limit===undefined||(booked[day]??0)>limit)throw Error(day+'：既存予定と統合すると認められた学習枠を超えます。');
  }
 }
 const scope=structuredClone(current?.scope??[]);
 for(const item of changed){
  if(scope.some(s=>s.unit===item.unit&&s.subjects.includes(item.subject)))continue;
  const incoming=candidate.scope.find(s=>s.unit===item.unit&&s.subjects.includes(item.subject));
  const deadline=scope.find(s=>s.unit===item.unit)?.deadline??incoming?.deadline??null;
  const group=scope.find(s=>s.unit===item.unit&&s.deadline===deadline);
  if(group)group.subjects.push(item.subject);
  else scope.push({unit:item.unit,subjects:[item.subject],deadline});
 }
 const merged:LearningSchedule|null=savePlan?{
  schemaVersion:'learning-schedule/1',planId:AUTO_SCHEDULE_ID,revision:Math.max(current?.revision??0,input.autoRevision)+1,
  baseVersion:currentVersion,generatedAt:new Date(now).toISOString(),accountBinding:binding,
  provisional:candidate.provisional||!!current?.provisional,notes:candidate.notes,gaps:candidate.gaps,
  scope,capacities,...(confirmedCapacityDays.length?{confirmedCapacityDays}:{}),items:[...nextItems.values()],sync:{source,decisions},
  ...(current?.proposalImport?{proposalImport:current.proposalImport}:{}),
 }:null;
 const plan=merged?prepareScheduleFile(JSON.stringify(merged),tasks.map(e=>e.task),current,binding,true).plan:null;
 const waiting=decisions.filter(d=>d.kind==='waiting'),held=decisions.filter(d=>d.kind==='held');
 const unplaced=classifications.filter(row=>{
  const task=live.get(row.taskId)?.task;
  return task&&task.status!=='completed'&&!hasDate(nextItems.get(row.taskId))&&!hasDate(oldItem(task))&&!task.planning?.wbs?.startDay&&!task.planning?.wbs?.endDay;
 });
 const appliedTaskIds=[...new Set([...appliedAlready,...changed.map(i=>i.taskId)])].sort();
 const state:ScheduleSyncState={
  schemaVersion:1,status:waiting.length||held.length?(appliedTaskIds.length?'partial':'pending'):'synced',
  syncedAt:plan?now:previous?.syncedAt??null,versionId:versionId(plan??current),unplaced:unplaced.length,
  waiting:waiting.length,conflicts:held.length,reasons:[...new Set([...waiting,...held].map(d=>d.reason))].slice(0,12),
  source,appliedTaskIds,waitingTaskIds:waiting.map(d=>d.taskId).sort(),
 };
 const appliedMinutes:Record<string,number>={};
 for(const i of changed)for(const [day,work] of Object.entries(i.dailyWork))appliedMinutes[day]=(appliedMinutes[day]??0)+work.minutes;
 return {plan,state,classifications,unplaced,changed,minutes:appliedMinutes};
}
