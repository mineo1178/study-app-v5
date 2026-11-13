import {displayDifference,displayItem,historyDay,measuredProgress} from './gantt-display';
import {ganttLag} from './gantt-lag';
import {actualOf,scheduleDaily,type LearningSchedule} from './schedule';
import {planOf,type PlanningTask} from './model';
import {scheduleDelay,wbsDates} from './wbs';
export function progressFacts(task:PlanningTask,plan:LearningSchedule|null,today:string){
 const item=displayItem(task,plan),actual=measuredProgress(task,item),manual=planOf(task).wbs?.progress??null,raw=displayDifference(task,item,today),lag=ganttLag([task],plan,today),daily=scheduleDaily(item),goal=item.baseline.daily;
 const expected=(days:Record<string,number>)=>Object.keys(days).length&&Object.values(days).every(n=>Number.isFinite(n)&&n>=0)?Object.entries(days).reduce((n,[d,v])=>n+(d<=today?v:0),0):null;
 const planned=expected(daily),fixed=expected(goal),total=item.ranges.reduce((n,r)=>n+r.units,0),missing:string[]=[];
 if(!(total>0))missing.push('範囲・作業量');if(actual===null)missing.push('採点・必要な直しまでの実績');if(planned===null)missing.push('採用済み日別予定');if(fixed===null)missing.push('固定目標の日別基準');
 const remainingUnits=task.status==='completed'?0:total>0&&actual!==null?item.ranges.reduce((n,r)=>{const a=actualOf(task,r.id);return n+(a?.done&&a.graded&&a.corrected?0:r.units);},0):null;
 const dates=task.history.filter(h=>!h.operationCheck&&h.reviewStatus!=='pending').map(historyDay).filter((d):d is string=>!!d).sort();
 const timestamps=[...task.history.filter(h=>!h.operationCheck&&h.reviewStatus!=='pending').map(h=>h.endAt??0),...Object.values(task.scheduleActuals??{}).map(a=>a.recordedAt)].filter(n=>Number.isFinite(n)&&n>0);
 return{actual,manual,planned,fixed,red:lag.manual,purple:lag.goal,missing,remainingUnits,totalUnits:total>0?total:null,remainingEstimatedMinutes:task.status==='completed'?0:null,actualFirstDay:dates[0]??null,actualLastDay:dates.at(-1)??null,actualUpdatedAt:timestamps.length?Math.max(...timestamps):null,reference:actual===null&&manual!==null?{red:planned===null?null:manual-planned,purple:fixed===null?null:manual-fixed}:null,raw};
}
export function progressSummary(tasks:PlanningTask[],plan:LearningSchedule|null,today:string){
 const unique=[...new Map(tasks.map(t=>[t.id,t])).values()],facts=unique.map(t=>progressFacts(t,plan,today));
 return{total:unique.length,completed:unique.filter(t=>t.status==='completed').length,remaining:unique.filter(t=>t.status!=='completed').length,scheduled:unique.filter(t=>{const d=wbsDates(t,plan);return d.end&&d.endSource!=='提案';}).length,comparable:facts.filter(f=>f.red!==null||f.purple!==null).length,overdue:unique.filter(t=>scheduleDelay(t,plan,today)>0).length,behind:facts.filter(f=>(f.red!==null&&f.red<0)||(f.purple!==null&&f.purple<0)).length,unavailable:facts.filter(f=>f.red===null&&f.purple===null).length};
}
