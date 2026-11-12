import {validDay,type PlanningTask} from './model';
import {materialKey,type LearningSchedule} from './schedule';
type Phase={phase:'first_and_marking'|'correction'|'final_check';day:string;minutes:number;conditional:boolean};
export type TaskSuggestion={taskId:string;recommendedEndDate:string;phases:Phase[]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function taskSuggestion(task:PlanningTask,plan:LearningSchedule|null):TaskSuggestion|null{
 if(task.status==='completed')return null;
 const rows=plan?.proposalImport?.source.planningPolicy.taskSchedules;if(!Array.isArray(rows))return null;
 const matches=rows.filter((r:unknown)=>object(r)&&r.taskId===task.id&&r.unit===task.unit&&r.subject===task.subject&&r.category===task.category&&r.materialName===task.materialName&&r.materialId===materialKey(task));if(matches.length!==1)return null;
 const r=matches[0];if(!object(r)||typeof r.recommendedEndDate!=='string'||!validDay(r.recommendedEndDate)||!Array.isArray(r.phases)||r.phases.length>10||!r.phases.every((p:unknown)=>object(p)&&['first_and_marking','correction','final_check'].includes(String(p.phase))&&typeof p.day==='string'&&validDay(p.day)&&typeof p.minutes==='number'&&Number.isFinite(p.minutes)&&p.minutes>0&&p.minutes<=1440&&typeof p.conditional==='boolean'))return null;
 return{taskId:task.id,recommendedEndDate:r.recommendedEndDate,phases:r.phases as Phase[]};
}
export const phaseName=(phase:Phase['phase'])=>phase==='first_and_marking'?'初回演習・採点':phase==='correction'?'直し予約（誤答時のみ）':'最終確認';
