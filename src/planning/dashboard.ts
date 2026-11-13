import {taskCounts} from './gantt-grid';
import {progressFacts} from './progress-summary';
import {wbsDates} from './wbs';
import {displayItem} from './gantt-display';
import {questionComparison} from './question-progress';
import {scheduleDaily} from './schedule';
import type {PlanningTask} from './model';
import type {LearningSchedule} from './schedule';

export const completionPercent=(completed:number,total:number)=>total?Math.round(completed/total*100):0;
export function dashboardFacts(tasks:PlanningTask[],plan:LearningSchedule|null,today:string){
 const unique=[...new Map(tasks.map(t=>[t.id,t])).values()],counts=taskCounts(unique);
 const selected=plan?.items.length?unique.filter(t=>plan.items.some(i=>i.taskId===t.id)):unique;
 const remaining=selected.filter(t=>t.status!=='completed'),facts=remaining.map(t=>progressFacts(t,plan,today));
 const bases=remaining.map(t=>{const item=displayItem(t,plan),q=questionComparison(t,item,today);return {manual:q?q.manualDaily:scheduleDaily(item),goal:q?q.goalDaily:item.baseline.daily};});
 const ends=remaining.map(t=>wbsDates(t,plan)).filter(d=>d.end&&d.endSource!=='提案').map(d=>d.end!).sort();
 const missing:string[]=[];
 if(facts.some(f=>f.totalUnits===null))missing.push('範囲・総問題数');
 if(facts.some(f=>f.actual===null))missing.push('範囲別実績');
 if(bases.some(b=>!Object.keys(b.manual).length))missing.push('日別数量・同じ範囲の予定');
 if(bases.some(b=>!Object.keys(b.goal).length))missing.push('採用済み固定目標');
 return {counts,percent:completionPercent(counts.completed,counts.total),deadline:ends[0]??null,comparisonTotal:remaining.length,missing};
}
