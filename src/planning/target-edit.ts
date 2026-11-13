import {addDays,estimate,planOf,validDay,validatePlan,type Baseline,type PlanningTask,type TaskPlan} from './model';
import {displayItem} from './gantt-display';
import {taskSuggestion} from './schedule-proposals';
import type {LearningSchedule,ScheduleStage} from './schedule';

export function standardTargetDay(task:PlanningTask,plan:LearningSchedule|null,today:string){
 const source=plan?.proposalImport?.source,round=Number(task.unit.match(/\d+/)?.[0]);
 const lesson=source?.classEvents.filter(e=>e.round===round&&e.subjects.includes(task.subject as never)).map(e=>e.date).sort().at(-1);
 if(lesson){const weekday=new Date(lesson).getUTCDay();return addDays(lesson,(4-weekday+7)%7);}
 if(source?.targetExam&&source.targetExam.rounds.includes(round)){const exam=source.targetExam.date,weekday=new Date(exam).getUTCDay();return addDays(exam,-((weekday-4+7)%7)-7*(Math.max(...source.targetExam.rounds)-round));}
 return addDays(today,(4-new Date(today).getUTCDay()+7)%7);
}

export function targetPreview(task:PlanningTask,tasks:PlanningTask[],plan:LearningSchedule|null,today:string,targetDay:string){
 const item=displayItem(task,plan),scope={...task,planning:{...planOf(task),ranges:item.ranges.map(r=>({...r,day:r.day??'',done:false,graded:false,corrected:false,actualDay:null,actualSeconds:null}))}};
 const evidence=estimate(scope,tasks.map(t=>t.id===task.id?scope:t),null);
 const measuredScope=item.ranges.reduce((n,r)=>n+r.units,0)>0;
 if(!measuredScope){evidence.count=0;evidence.firstCount=0;evidence.redoCount=0;evidence.firstSeconds=null;evidence.redoSeconds=null;evidence.provisional=true;}
 const stages=item.stages?.length?item.stages:taskSuggestion(task,plan)?.phases??[];
 const historyFirst=evidence.firstSeconds===null?null:Math.ceil(evidence.firstSeconds/60),historyRedo=evidence.redoSeconds===null?null:Math.ceil(evidence.redoSeconds/60);
 const first=historyFirst??(stages.filter(s=>s.phase==='first_and_marking').reduce((n,s)=>n+s.minutes,0)||null);
 const redo=historyRedo??(stages.filter(s=>s.phase==='correction').reduce((n,s)=>n+s.minutes,0)||null);
 const final=stages.filter(s=>s.phase==='final_check').reduce((n,s)=>n+s.minutes,0)||null;
 const estimated=first===null?null:first+(redo??0)+(final??0),provisional=evidence.provisional||first===null||redo===null||final===null;
 const source=plan?.proposalImport?.source,round=Number(task.unit.match(/\d+/)?.[0]);
 const lesson=source?.classEvents.filter(e=>e.round===round&&e.subjects.includes(task.subject as never)).map(e=>e.date).sort().at(-1);
 const notBefore=lesson&&lesson>today?lesson:today;
 const remaining:Record<string,number>={},stagesByDay:Record<string,number>={};
 for(const other of tasks.filter(t=>t.id!==task.id)){
  const otherItem=displayItem(other,plan);
  if(other.status==='completed')continue;
  const booked=otherItem.stages?.length?otherItem.stages:otherItem.ranges.flatMap(r=>r.day?[{day:r.day,minutes:r.minutes}]:[]);
  for(const booking of booked)stagesByDay[booking.day]=(stagesByDay[booking.day]??0)+booking.minutes;
 }
 let capacityKnown=!!plan&&Object.keys(plan.capacities).length>0;
 if(validDay(targetDay))for(let day=notBefore,n=0;day<=targetDay&&n<366;day=addDays(day,1),n++){
  if(plan?.capacities[day]===undefined)capacityKnown=false;
  const actualToday=day===today?tasks.flatMap(t=>t.history).filter(h=>!h.operationCheck&&h.reviewStatus!=='pending'&&(h.endAt?new Date(h.endAt+9*3600000).toISOString().slice(0,10):h.date)===today).reduce((sum,h)=>sum+h.duration/60,0):0;
  remaining[day]=Math.max(0,(plan?.capacities[day]??0)-(stagesByDay[day]??0)-actualToday);
 }
 const available=capacityKnown?Object.values(remaining).reduce((sum,value)=>sum+value,0):null;
 const phases:ScheduleStage[]=[],allocation={...remaining};
 let unmet=0;
 function allocate(phase:ScheduleStage['phase'],minutes:number,firstDay:string,lastDay:string){
  let left=minutes;
  for(const day of Object.keys(allocation).sort())if(day>=firstDay&&day<=lastDay&&left>0){const used=Math.min(allocation[day],left);if(used>0){phases.push({phase,day,minutes:used,conditional:phase==='correction'});allocation[day]-=used;left-=used;}}
  unmet+=left;
 }
 if(estimated!==null&&capacityKnown&&validDay(targetDay)){
  const earlyEnd=addDays(targetDay,-1);
  allocate('first_and_marking',first!,notBefore,earlyEnd>=notBefore?earlyEnd:targetDay);
  const firstEnd=phases.filter(p=>p.phase==='first_and_marking').map(p=>p.day).sort().at(-1)??notBefore;
  const redoStart=[addDays(notBefore,Math.max(1,evidence.redoDays)),addDays(firstEnd,1)].sort().at(-1)!;
  allocate('correction',redo??0,redoStart,targetDay);
  allocate('final_check',final??0,targetDay,targetDay);
 }
 return{item,evidence,estimated,available,shortfall:estimated===null||available===null?null:Math.max(0,estimated-available,unmet),provisional,notBefore,phases,measuredScope,remaining};
}

export function reviseTarget(task:PlanningTask,tasks:PlanningTask[],plan:LearningSchedule|null,today:string,targetDay:string,reason:string,memo:string,now:number):TaskPlan{
 if(!validDay(targetDay)||!reason.trim()||reason.length>100||memo.length>200)throw Error('目標日と変更理由を確認してください。');
 const old=planOf(task),preview=targetPreview(task,tasks,plan,today,targetDay),id='wbs-target-'+now+'-'+(old.revision+1);
 const current=displayItem(task,plan).baseline,previous=old.baseline??(current.targetDay?structuredClone(current):null);
 const daily:Record<string,number>={};
 if(preview.measuredScope&&preview.estimated&&preview.shortfall===0){
  for(const phase of preview.phases)daily[phase.day]=(daily[phase.day]??0)+phase.minutes/preview.estimated*100;
 }
 const baseline:Baseline={id,createdDay:today,targetDay,daily,basisStatus:Object.keys(daily).length?'measured_work':'unmeasured',evidence:{...preview.evidence,source:'WBS目標日変更',estimatedMinutes:preview.estimated,provisional:preview.provisional||!Object.keys(daily).length,conditions:[preview.evidence.conditions,'変更理由 '+reason,memo?'メモ '+memo:'',preview.shortfall===null?'容量・見積に未確認あり':'不足 '+preview.shortfall+'分',Object.keys(daily).length?'同じ対象範囲の仮見積配分':'日付のみ設定・日別比較基準は未算出'].filter(Boolean).join('／')}};
 const result:TaskPlan={...structuredClone(old),baseline,baselineHistory:[...old.baselineHistory,...(old.baseline?[structuredClone(old.baseline)]:[])],targetRevisions:[...old.targetRevisions??[],{id,revision:old.revision+1,changedAt:now,reason:reason.trim(),memo:memo.trim(),oldTargetDay:current.targetDay,newTargetDay:targetDay,previousBaseline:previous,sourceVersion:plan?plan.planId+'--r'+plan.revision:null,phases:preview.phases}]};
 validatePlan(result);
 return result;
}
