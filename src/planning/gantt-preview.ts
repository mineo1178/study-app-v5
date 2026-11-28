import type {EventCalendar} from './events';
import {bookedScheduleMinutes,boundProposals,dayDisplay,displayItem} from './gantt-display';
import {compareRounds} from './gantt-grid';
import {taskDeadline} from './learning-alerts';
import type {PlanningTask} from './model';
import {replanCapacities} from './schedule-capacity';
import {adoptedDay} from './schedule-layers';
import type {LearningSchedule} from './schedule';
import {wbsDates} from './wbs';
import {workloadEvidence} from './workload';

export const DEFAULT_PREVIEW_MINUTES=15;
export const GANTT_PREVIEW_DAYS=14;
export const validPreviewMinutes=(minutes:number)=>Number.isInteger(minutes)&&minutes>=1&&minutes<=1440;

type DayCapacity={limit:number;booked:number;draft:number;confirmed:boolean;unknownBooking:boolean};
export type PreviewPlacement={day:string;minutes:number;scopeUnknown:boolean;timeUnknown:boolean;overdue:boolean};
export type PreviewOmission='capacity'|'deadline'|'unknown-booking';
export const previewOmissionLabel:Record<PreviewOmission,string>={
 capacity:'空き枠不足',deadline:'期限までの空き枠不足','unknown-booking':'既存予定の時間が未確認',
};

export function buildGanttPreview(tasks:PlanningTask[],plan:LearningSchedule|null,calendar:EventCalendar,today:string,confirmed:Record<string,number>,defaultMinutes:number){
 const capacities=replanCapacities(today,plan?.capacities??{},confirmed,GANTT_PREVIEW_DAYS);
 const horizon=Object.keys(capacities);
 const taskIds=new Set(tasks.map(task=>task.id));
 const orphanBookings=bookedScheduleMinutes([],plan?.items.filter(item=>!taskIds.has(item.taskId))??[]);
 const days=new Map<string,DayCapacity>(horizon.map(day=>[day,{
  limit:capacities[day],booked:orphanBookings[day]??0,draft:0,
  confirmed:Object.hasOwn(confirmed,day)||!!plan?.confirmedCapacityDays?.includes(day),unknownBooking:false,
 }]));
 const upcomingAdopted=new Set<string>();
 const inHorizonAdopted=new Set<string>();
 const candidates=tasks.flatMap(task=>{
  const item=displayItem(task,plan);
  const dates=wbsDates(task,plan);
  const adoptedDates=[
   dates.startSource!=='提案'?dates.start:null,dates.endSource!=='提案'?dates.end:null,
   ...item.ranges.map(range=>range.day),...item.stages?.map(stage=>stage.day)??[],
   ...boundProposals(task,plan).filter(row=>row.record.selected).map(row=>row.record.adoptedDay),
  ];
  if(adoptedDates.some(day=>day&&day>=today))upcomingAdopted.add(task.id);
  for(const [day,capacity] of days){
   const facts=dayDisplay(task,item,plan,day);
   if(!facts.planned&&!adoptedDay(task,plan,day))continue;
   inHorizonAdopted.add(task.id);
   upcomingAdopted.add(task.id);
   if(facts.minutes===null)capacity.unknownBooking=true;
   else capacity.booked+=facts.minutes;
  }
  if(task.status==='completed'||upcomingAdopted.has(task.id))return [];
  const due=taskDeadline(task,plan,calendar);
  const evidence=workloadEvidence(task,item.ranges,tasks,plan);
  const minutes=(evidence.time?.kind==='registered'||task.status==='not_started')?evidence.time?.minutes:null;
  return [{task,deadline:due.confirmed?due.day:null,minutes:minutes??defaultMinutes,scopeUnknown:!evidence.scope,timeUnknown:minutes==null}];
 }).sort((a,b)=>(a.deadline??'9999').localeCompare(b.deadline??'9999')||
  compareRounds(a.task.unit,b.task.unit)||a.task.id.localeCompare(b.task.id));
 const placements=new Map<string,PreviewPlacement>();
 const unplaced:{task:PlanningTask;reason:PreviewOmission}[]=[];
 for(const {task,deadline,minutes,scopeUnknown,timeUnknown} of candidates){
  const overdue=!!deadline&&deadline<today;
  const allowed=horizon.filter(day=>!deadline||overdue||day<=deadline);
  const fits=(capacity:DayCapacity)=>capacity.limit-capacity.booked-capacity.draft>=minutes;
  const day=allowed.find(day=>!days.get(day)!.unknownBooking&&fits(days.get(day)!));
  if(day){
   days.get(day)!.draft+=minutes;
   placements.set(task.id,{day,minutes,scopeUnknown,timeUnknown,overdue});
  }else{
   const reason=allowed.some(day=>days.get(day)!.unknownBooking&&fits(days.get(day)!))?'unknown-booking':
    allowed.length<horizon.length?'deadline':'capacity';
   unplaced.push({task,reason});
  }
 }
 return {days,placements,unplaced,inHorizonAdopted};
}
