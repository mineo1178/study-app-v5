import {estimate,planOf,type PlanningTask} from './model';
import {scopeText,taskIdentity} from './official-schedule';
import type {LearningSchedule,ScheduleRange} from './schedule';

export type WorkScope={label:string;units:number|null;source:string};
export type WorkTime={kind:'registered'|'estimated';minutes:number|null;firstSeconds:number|null;gradingSeconds:null;redoSeconds:number|null;source:string};

const validUnits=(units:number)=>Number.isFinite(units)&&units>=0.01&&units<=10000;
const validMinutes=(minutes:number)=>Number.isFinite(minutes)&&minutes>=1&&minutes<=1440;

function explicitScope(text:string,source:string):WorkScope|null{
 const normal=text.normalize('NFKC').trim();
 if(!normal||normal.length>150||/未確認|未定|候補|要確認|目安/.test(normal))return null;
 const count=/(?:^|[\s(、:：])全\s*(\d{1,5})\s*問[)\s]*$/.exec(normal);
 if(count&&validUnits(Number(count[1])))return {label:text.trim(),units:Number(count[1]),source};
 const numbered=/(?:^|[\s(、:：])問\s*(\d{1,5})(?:\s*[〜～~–—−-]\s*問?\s*(\d{1,5}))?[)\s]*$/.exec(normal);
 if(numbered){
  const first=Number(numbered[1]),last=Number(numbered[2]??numbered[1]);
  if(first>0&&last<=10000&&last>=first)return {label:text.trim(),units:last-first+1,source};
 }
 return /(?:^|[\s(、:：])(?:p\.?\s*\d{1,4}|\d{1,4}\s*ページ)(?:\s*[〜～~–—−-]\s*(?:p\.?\s*)?\d{1,4}(?:\s*ページ)?)?[)\s]*$/i.test(normal)?
  {label:text.trim(),units:null,source}:null;
}

function documentScope(task:PlanningTask,current:LearningSchedule|null):WorkScope|null{
 const data=current?.proposalImport;
 if(!data)return null;
 const identity=taskIdentity(task);
 const proposals=data.source.taskProposals.filter(p=>p.subject===task.subject&&`第${p.round}回`===task.unit&&
  !/unconfirmed|to_confirm|unknown/i.test(p.scope.selection)&&data.records.some(r=>r.verified&&r.taskId===task.id&&
   r.identity===identity&&r.proposalTaskId===p.proposalTaskId));
 if(proposals.length!==1)return null;
 const p=proposals[0];
 const source=`確認済み教材資料 ${data.source.planId} r${data.source.revision}／${p.proposalTaskId}${p.evidenceRefs.length?'／'+p.evidenceRefs.join('・'):''}`;
 const stated=explicitScope(p.scope.instructions,source);
 if(stated)return stated;
 const label=scopeText(p);
 return p.scope.pdfPages.length&&label.length<=150&&!/未確認|未定|要確認|候補/.test(p.scope.instructions)?{label,units:null,source}:null;
}

const usable=(task:PlanningTask,units:number)=>task.history.filter(h=>!h.operationCheck&&h.reviewStatus!=='pending'&&
 (h.graded===true||typeof h.score==='number'&&Number.isFinite(h.score))&&Number.isFinite(h.duration)&&h.duration>0&&
 h.units===units&&(h.attemptType==='first'||h.attemptType==='redo'));

export function workloadEvidence(task:PlanningTask,ranges:ScheduleRange[],tasks:PlanningTask[],current:LearningSchedule|null){
 const native=planOf(task),known=ranges.length>0&&ranges.every(r=>r.label.trim()&&validUnits(r.units)&&validMinutes(r.minutes));
 const scope:WorkScope|null=ranges.length?{
  label:ranges.map(r=>r.label).join('・'),units:ranges.every(r=>validUnits(r.units))?ranges.reduce((sum,r)=>sum+r.units,0):null,source:'本番に登録済みの範囲',
 }:native.questionMeasurement?.confirmed&&native.questionMeasurement.label&&native.questionMeasurement.total&&
  validUnits(native.questionMeasurement.total)&&native.questionMeasurement.label.length<=150?
  {label:native.questionMeasurement.label,units:native.questionMeasurement.total,source:'本番の確認済み問題範囲'}:
  documentScope(task,current)??explicitScope(task.title,'登録済み課題名の明示範囲');
 if(known)return {scope,time:{kind:'registered',minutes:ranges.reduce((sum,r)=>sum+r.minutes,0),firstSeconds:null,gradingSeconds:null,redoSeconds:null,source:'本番に登録済みの予定分数'} as WorkTime};
 if(!scope?.units||!validUnits(scope.units))return {scope,time:null};
 const units=scope.units,materialId=native.material?.materialId;
 const comparable=tasks.filter(t=>t.id!==task.id&&t.subject===task.subject&&t.category===task.category&&
  t.materialName===task.materialName&&t.materialName.trim()&&t.planning?.material?.materialId===materialId&&
  (explicitScope(t.title,'')?.units===units||t.planning?.questionMeasurement?.confirmed&&t.planning.questionMeasurement.total===units||
   ranges.length>0&&planOf(t).ranges.reduce((sum,r)=>sum+r.units,0)===units))
  .map(t=>({...t,history:usable(t,units)}));
 const evidence=estimate({...task,history:usable(task,units)},comparable,null,units);
 if(!evidence.count)return {scope,time:null};
 const {firstSeconds,redoSeconds}=evidence;
 // Grading has no separately timed history. A first attempt is usable only with a recorded grading result.
 const minutes=firstSeconds!==null&&redoSeconds!==null?Math.ceil((firstSeconds+redoSeconds)/60):null;
 return {scope,time:{kind:'estimated',minutes:minutes&&validMinutes(minutes)?minutes:null,firstSeconds,gradingSeconds:null,redoSeconds,
  source:`${evidence.source}の採点済み履歴 ${evidence.count}件（初回${evidence.firstCount}件・直し${evidence.redoCount}件）`} as WorkTime};
}

export function canConfirmWorkload(task:PlanningTask){
 const plan=planOf(task);
 return task.status!=='completed'&&!task.isRunning&&!(task.currentDuration&&task.currentDuration>0)&&
  !plan.ranges.length&&!plan.baseline&&!plan.endDay&&!plan.wbs?.startDay&&!plan.wbs?.endDay&&
  !Object.values(task.scheduleActuals??{}).some(a=>a.done||a.graded||a.corrected||a.actualDay);
}

export function confirmedWorkload(task:PlanningTask,rangeId:string,label:string,units:number,minutes:number){
 if(!canConfirmWorkload(task))throw Error('学習状態または既存計画が変わりました。');
 if(!label.trim()||label.trim().length>150||!validUnits(units)||!validMinutes(minutes))throw Error('範囲・作業量・予定分数を確認してください。');
 return {...planOf(task),ranges:[{id:rangeId,label:label.trim(),units,minutes,day:'',done:false,graded:false,corrected:false,actualDay:null,actualSeconds:null}]};
}
