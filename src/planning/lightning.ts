import {displayDifference,displayItem} from './gantt-display';
import {scheduleDaily,type LearningSchedule} from './schedule';
import type {PlanningTask} from './model';

export function lightningPoints(task:PlanningTask,plan:LearningSchedule|null,today:string,start:string,span:number){
 const item=displayItem(task,plan),facts=displayDifference(task,item,today);
 const todayX=((Date.parse(today)-Date.parse(start))/86400000+.5)*74;
 if(todayX<0||todayX>span*74||facts.progress===null)return [];
 return [{kind:'manual',value:facts.manual,daily:scheduleDaily(item)},{kind:'goal',value:facts.goal,daily:item.baseline.daily}].flatMap(series=>{
  if(!series.value||!Number.isFinite(series.value.points))return [];
  let position=todayX;
  if(series.value.points!==0){
   let cumulative=0;
   for(const [day,work] of Object.entries(series.daily).sort(([a],[b])=>a.localeCompare(b))){
    if(work<=0)continue;
    if(facts.progress!<=cumulative+work){position=((Date.parse(day)-Date.parse(start))/86400000-.5+(facts.progress!-cumulative)/work)*74;break;}
    cumulative+=work;
   }
  }
  position=Math.max(1,Math.min(span*74-1,position));
  return [{kind:series.kind,points:`${todayX},0 ${position},20 ${todayX},40`,difference:series.value.points}];
 });
}
