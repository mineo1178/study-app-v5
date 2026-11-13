import type {PlanningTask} from './model';
import type {LearningSchedule} from './schedule';
import {wbsDates} from './wbs';
export function wbsEditValues(task:PlanningTask,plan:LearningSchedule|null,field:'startDay'|'endDay'|'progress'){
 const dates=wbsDates(task,plan);
 return{startDay:dates.manualStart||(field!=='progress'?dates.start??'':''),endDay:dates.manualEnd||(field!=='progress'?dates.end??'':''),progress:task.planning?.wbs?.progress?.toString()??''};
}
