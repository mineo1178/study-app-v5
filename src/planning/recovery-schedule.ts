import {addDays,estimate,type PlanningTask} from './model';
import {displayItem,historyDay} from './gantt-display';
import {actualOf,type LearningSchedule} from './schedule';
import {taskSuggestion} from './schedule-proposals';
import {taskDeadline} from './learning-alerts';
import {visibleEvents,type EventCalendar} from './events';

// A read-only projection. Neither adopted dates nor fixed progress goals are revised here.
export function recoverySchedule(tasks:PlanningTask[],plan:LearningSchedule|null,calendar:EventCalendar,today:string,candidate?:LearningSchedule|null){
 const unique=[...new Map(tasks.map(t=>[t.id,t])).values()];
 const jobs=unique.filter(t=>t.status!=='completed').map(task=>{
  const rows=(candidate??plan)?.proposalImport?.source.planningPolicy.taskSchedules;
  const row=Array.isArray(rows)?rows.find(r=>r.taskId===task.id&&r.unit===task.unit&&r.subject===task.subject&&r.category===task.category&&r.materialName===task.materialName):undefined;
  const work=row?.workEstimate as Record<string,unknown>|undefined;
  const item=displayItem(task,plan),suggestion=taskSuggestion(task,candidate??plan),stages=suggestion?.phases??item.stages??[];
  const sum=(phase:string)=>typeof work?.[phase]==='number'&&Number.isFinite(work[phase])&&Number(work[phase])>=0?Number(work[phase]):stages.filter(s=>s.phase===phase).reduce((n,s)=>n+s.minutes,0);
  const m=task.planning?.questionMeasurement,total=m?.confirmed?m.total:null,ranges=item.ranges,units=ranges.reduce((n,r)=>n+r.units,0);
  const fraction=(field:'done'|'graded'|'corrected')=>units>0?Math.max(0,1-ranges.reduce((n,r)=>n+((actualOf(task,r.id)?.[field]??task.planning?.ranges.find(old=>old.id===r.id)?.[field])?r.units:0),0)/units):1;
  const remaining=(count:number|null|undefined,fallback:number)=>total&&count!=null?Math.max(0,1-count/total):fallback;
  const evidence=estimate(task,unique,null),measured=total?task.history.filter(h=>h.units===total&&h.duration>0&&!h.operationCheck&&h.reviewStatus!=='pending'&&(h.graded===true||typeof h.score==='number'&&Number.isFinite(h.score))):[];
  const average=(attempt:string)=>{const rows=measured.filter(h=>h.attemptType===attempt);return rows.length?rows.reduce((n,h)=>n+h.duration,0)/rows.length:null;};
  if(average('first')!==null)evidence.firstSeconds=average('first');if(average('redo')!==null)evidence.redoSeconds=average('redo');
  const first=sum('first_and_marking')||ranges.reduce((n,r)=>n+r.minutes,0),grade=Math.min(5,first);
  const firstEstimate=evidence.firstSeconds!==null?evidence.firstSeconds/60:Math.max(0,first-grade);
  const redoEstimate=evidence.redoSeconds!==null?evidence.redoSeconds/60:sum('correction');
  const redoFraction=m?.confirmed&&m.correctionStatus!=='unknown'&&m.redoNeeded!=null&&m.redoDone!=null?(m.redoNeeded>0?Math.max(0,1-m.redoDone/m.redoNeeded):0):fraction('corrected');
  const phases=[{phase:'初回演習',minutes:Math.ceil(firstEstimate*remaining(m?.confirmed?m.firstDone:null,fraction('done')))},{phase:'採点',minutes:Math.ceil(grade*remaining(m?.confirmed?m.graded:null,fraction('graded')))},{phase:'必要な直し',minutes:Math.ceil(redoEstimate*redoFraction)},{phase:'最終確認',minutes:sum('final_check')}];
  const deadline=taskDeadline(task,plan,calendar),overdue=!!deadline.day&&deadline.day<today;
  const test=visibleEvents(calendar).find(e=>e.day>=today&&e.rounds.includes(task.unit)&&['karite','placement'].includes(e.kind));
  const last=overdue?(test?addDays(test.day,-1):addDays(today,13)):deadline.day??addDays(today,13);
  const notBefore=row?.availability?.notBefore??(Array.isArray(rows)?rows.find(r=>r.taskId===task.id)?.availability?.notBefore:undefined);
  const unknown=[...(!first?['演習・採点時間']:[]),...(!redoEstimate&&redoFraction>0?['必要な直し時間']:[]),...(!sum('final_check')?['最終確認時間']:[]),...(!total&&!units?['範囲・総数']:[]),...(total&&(m?.firstDone==null||m?.graded==null||m?.correctionStatus==='unknown')?['工程別残量']:[]),...(!deadline.confirmed?['正式期限']:[])];
  return{taskId:task.id,unit:task.unit,title:task.materialName||task.title,deadline:deadline.day,overdue,last,notBefore:notBefore??today,phases,unknown,basis:evidence.firstSeconds!==null?'同じ作業量の採点済み履歴を参考':'保存済み工程・範囲の仮見積'};
 });
 // Future deadlines are protected first, then overdue recovery uses the same remainder.
 jobs.sort((a,b)=>Number(a.overdue)-Number(b.overdue)||a.last.localeCompare(b.last)||a.taskId.localeCompare(b.taskId));
 const horizon=jobs.reduce((day,j)=>j.last>day?j.last:day,today),last=horizon<addDays(today,28)?horizon:addDays(today,28);
 const ledger:Record<string,{gross:number|null;spent:number;used:number;remaining:number}>={};
 for(let day=today;day<=last;day=addDays(day,1)){
  const gross=plan?.capacities[day]??null,spent=day===today?unique.flatMap(t=>t.history).filter(h=>!h.operationCheck&&h.reviewStatus!=='pending'&&h.duration>0&&historyDay(h)===today).reduce((n,h)=>n+h.duration/60,0):0;
  ledger[day]={gross,spent,used:0,remaining:Math.max(0,(gross??0)-spent)};
 }
 const allocations:{taskId:string;unit:string;title:string;phase:string;day:string;minutes:number;conditional:boolean;recovery:boolean}[]=[],shortfalls:{taskId:string;title:string;phase:string;minutes:number;reason:string}[]=[];
 for(const job of jobs){let from=job.notBefore>today?job.notBefore:today,blocked=false;
  for(const phase of job.phases){let left=phase.minutes,lastDay=from;
   if(!blocked)for(const [day,capacity]of Object.entries(ledger))if(day>=from&&day<=job.last&&left>0){const minutes=Math.min(left,capacity.remaining);if(minutes>0){allocations.push({taskId:job.taskId,unit:job.unit,title:job.title,phase:phase.phase,day,minutes,conditional:phase.phase==='必要な直し',recovery:job.overdue});capacity.remaining-=minutes;capacity.used+=minutes;left-=minutes;lastDay=day;}}
   if(left>0){shortfalls.push({taskId:job.taskId,title:job.title,phase:phase.phase,minutes:left,reason:blocked?'前工程が未配置':'既知容量・利用可能日・期限の制約'});blocked=true;}
   if(phase.minutes>0)from=phase.phase==='採点'?addDays(lastDay,1):lastDay;
  }
 }
 const unknown=jobs.filter(j=>j.unknown.length),missingCapacity=Object.entries(ledger).filter(([,v])=>v.gross===null).map(([day])=>day),unallocated=shortfalls.reduce((n,s)=>n+s.minutes,0);
 return{jobs,allocations,shortfalls,ledger,missingCapacity,unknown,unallocated,knownMinutes:jobs.reduce((n,j)=>n+j.phases.reduce((s,p)=>s+p.minutes,0),0),available:Object.values(ledger).reduce((n,d)=>n+Math.max(0,(d.gross??0)-d.spent),0),feasible:!unknown.length&&!missingCapacity.length&&!unallocated,confidence:unknown.length||missingCapacity.length?'低（未確認あり）':'仮見積',last};
}
export type RecoverySchedule=ReturnType<typeof recoverySchedule>;
