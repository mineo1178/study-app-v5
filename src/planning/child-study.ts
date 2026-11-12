import type { PlanningTask } from './model';
import { validDay } from './model';
import { actualOf,type LearningSchedule,type ScheduleRange } from './schedule';
import { boundProposals,displayItem } from './gantt-display';
import { scopeText } from './official-schedule';
export type ChildAssignment={task:PlanningTask;day:string;ranges:ScheduleRange[];scopes:string[];completed:boolean;state:'完了'|'途中'|'未着手';knownMinutes:number;remainingMinutes:number;unknownTime:boolean;source:'正式採用済み'|'仮計画'|'手動予定';completionDays:string[]};
export function rangeFinished(task:PlanningTask,range:ScheduleRange){const a=actualOf(task,range.id);return !!a&&a.label===range.label&&a.units===range.units&&a.done&&a.graded&&a.corrected;}
export function completedRangeDays(task:PlanningTask,plan:LearningSchedule|null){return [...new Set(displayItem(task,plan).ranges.filter(r=>rangeFinished(task,r)).map(r=>actualOf(task,r.id)?.actualDay).filter((d):d is string=>!!d&&validDay(d)))];}
export function assignmentsOn(tasks:PlanningTask[],plan:LearningSchedule|null,day:string):ChildAssignment[]{
 return tasks.flatMap(task=>{const item=displayItem(task,plan),ranges=item.ranges.filter(r=>r.day===day),adopted=boundProposals(task,plan).filter(b=>b.record.selected&&b.record.adoptedDay===day);if(!ranges.length&&!adopted.length)return[];
 const proposalCovered=adopted.every(b=>ranges.some(r=>r.label===scopeText(b.proposal))),rangeComplete=ranges.length>0&&ranges.every(r=>rangeFinished(task,r));
 const completed=task.status==='completed'||rangeComplete&&proposalCovered;
 const knownMinutes=ranges.length?ranges.reduce((n,r)=>n+r.minutes,0):adopted.reduce((n,b)=>n+(b.proposal.estimatedWorkSeconds??0)/60,0);
 const unknownTime=adopted.some(b=>b.proposal.estimatedWorkSeconds===null&&!ranges.some(r=>r.label===scopeText(b.proposal)));
 const remainingMinutes=completed?0:ranges.length?ranges.filter(r=>!rangeFinished(task,r)).reduce((n,r)=>n+r.minutes,0):knownMinutes;
 const started=task.status==='in_progress'||ranges.some(r=>{const a=actualOf(task,r.id);return a?.done||a?.graded||a?.corrected;});
 return[{task,day,ranges,scopes:[...new Set([...ranges.map(r=>r.label),...adopted.map(b=>scopeText(b.proposal))])],completed,state:completed?'完了' as const:started?'途中' as const:'未着手' as const,knownMinutes,remainingMinutes,unknownTime,source:adopted.length?'正式採用済み' as const:plan?.items.some(i=>i.taskId===task.id)&&plan.provisional?'仮計画' as const:'手動予定' as const,completionDays:completedRangeDays(task,plan)}];});
}
export function assignmentSummary(entries:ChildAssignment[]){return{total:entries.length,completed:entries.filter(e=>e.completed).length,remaining:entries.filter(e=>!e.completed).length,knownRemainingMinutes:entries.reduce((n,e)=>n+e.remainingMinutes,0),unknownRemaining:entries.filter(e=>!e.completed&&e.unknownTime).length};}
