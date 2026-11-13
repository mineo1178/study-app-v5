import {planOf,validateWbs,type WbsEdit,type PlanningTask,type TaskPlan} from './model';
import {displayItem,measuredProgress,endDisplay} from './gantt-display';
import {taskSuggestion} from './schedule-proposals';
import type {LearningSchedule} from './schedule';

export type {WbsEdit} from './model';
export function editWbs(task:PlanningTask,values:Pick<WbsEdit,'startDay'|'endDay'|'progress'>,uid:string,now:number):TaskPlan{
 const wbs={...values,taskId:task.id,updatedBy:uid,updatedAt:now};validateWbs(wbs);return {...structuredClone(planOf(task)),wbs};
}
export function wbsDates(task:PlanningTask,plan:LearningSchedule|null){
 const w=planOf(task).wbs,item=displayItem(task,plan),days=item.ranges.flatMap(r=>r.day?[r.day]:[]).sort(),end=endDisplay(task,plan),suggestion=taskSuggestion(task,plan),proposed=suggestion?.phases.map(p=>p.day).sort()??[];
 const start=w?.startDay||days[0]||proposed[0]||null,finish=w?.endDay||end.day||suggestion?.recommendedEndDate||end.reference[0]||null;
 return {start,end:finish,startSource:w?.startDay?'手動予定':days.length?'予定':start?'提案':'',endSource:w?.endDay?'手動予定':end.day?'予定':finish?'提案':'',manualStart:w?.startDay??'',manualEnd:w?.endDay??''};
}
export function wbsProgress(task:PlanningTask,plan:LearningSchedule|null){const manual=planOf(task).wbs?.progress;return {value:manual??measuredProgress(task,displayItem(task,plan)),source:manual!==null&&manual!==undefined?'手動':'実績'};}
export function wbsSummary(tasks:PlanningTask[],plan:LearningSchedule|null){
 const values=tasks.map(task=>({...wbsProgress(task,plan),weight:displayItem(task,plan).ranges.reduce((n,r)=>n+r.minutes,0)})),total=values.reduce((n,r)=>n+r.weight,0);
 const progress=values.length&&Number.isFinite(total)&&values.every(v=>v.value!==null&&Number.isFinite(v.value)&&Number.isFinite(v.weight)&&v.weight>0)?values.reduce((n,v)=>n+v.value!*v.weight,0)/total:null;
 const dates=tasks.map(t=>wbsDates(t,plan)),allStart=dates.length&&dates.every(d=>d.start&&d.startSource!=='提案'),allEnd=dates.length&&dates.every(d=>d.end&&d.endSource!=='提案');
 return{progress,source:new Set(values.map(v=>v.source)).size>1?'手動・実績混在':values[0]?.source??'実績',start:allStart?dates.map(d=>d.start!).sort()[0]:null,end:allEnd?dates.map(d=>d.end!).sort().at(-1)!:null};
}
export function scheduleDelay(task:PlanningTask,plan:LearningSchedule|null,today:string){const d=wbsDates(task,plan);return task.status!=='completed'&&d.end&&d.endSource!=='提案'&&d.end<today?Math.round((Date.parse(today)-Date.parse(d.end))/86400000):0;}
