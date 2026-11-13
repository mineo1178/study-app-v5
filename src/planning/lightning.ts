import {ganttLag} from './gantt-lag';
import type {LearningSchedule} from './schedule';
import type {PlanningTask} from './model';

export function lightningPoints(task:PlanningTask,plan:LearningSchedule|null,today:string,start:string,span:number){
 const facts=ganttLag([task],plan,today);
 const todayX=((Date.parse(today)-Date.parse(start))/86400000+.5)*74;
 if(todayX<0||todayX>span*74)return [];
 return [{kind:'manual',value:facts.manual},{kind:'goal',value:facts.goal}].flatMap(series=>{
  if(series.value===null||!Number.isFinite(series.value))return [];
  // Each task has its own comparison. Never connect missing or unlike scopes.
  const position=Math.max(1,Math.min(span*74-1,todayX+Math.max(-100,Math.min(100,series.value))*1.6));
  return [{kind:series.kind,points:`${todayX},0 ${position},20 ${todayX},40`,difference:series.value}];
 });
}
