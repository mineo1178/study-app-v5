import type {OfficialPlan} from './official-schema';
import {convertOfficialPlan,initialResolutions} from './official-schedule';
import {taskSuggestion} from './schedule-proposals';
import type {PlanningTask} from './model';
import type {LearningSchedule} from './schedule';
export function referencePlan(source:OfficialPlan,tasks:PlanningTask[],current:LearningSchedule|null,binding:string){
 // File-supplied adoption flags are deliberately not used for reference import.
 return convertOfficialPlan({source,records:initialResolutions(source,tasks,current)},tasks,current,binding);
}
export function referenceSummary(tasks:PlanningTask[],plan:LearningSchedule|null,start:string,end:string){
 const source=plan?.proposalImport?.source,rows=source?.planningPolicy.taskSchedules;
 const suggestions=tasks.flatMap(t=>{const s=taskSuggestion(t,plan);return s?[s]:[];}),days=suggestions.flatMap(s=>s.phases.map(p=>p.day)).sort();
 return{source,provided:Array.isArray(rows)?rows.length:0,matched:suggestions.length,unmatched:Array.isArray(rows)?Math.max(0,rows.length-suggestions.length):0,visible:suggestions.filter(s=>s.phases.some(p=>p.day>=start&&p.day<=end)).length,firstDay:days[0]??null,lastDay:days.at(-1)??null};
}
