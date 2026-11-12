import {endDisplay} from './gantt-display';
import {taskSuggestion} from './schedule-proposals';
import {canonical,type LearningSchedule} from './schedule';
import type {PlanningTask} from './model';
export function ganttEnd(task:PlanningTask,plan:LearningSchedule|null){const end=endDisplay(task,plan);if(end.day)return{day:end.day,label:'予定'};const day=taskSuggestion(task,plan)?.recommendedEndDate??end.reference[0]??null;return{day,label:day?'提案':''};}
export function planIdentity(plan:LearningSchedule|null){return{planId:plan?.proposalImport?.source.planId??plan?.planId??null,revision:plan?.proposalImport?.source.revision??plan?.revision??null,appRevision:plan?.revision??null};}
export function referenceChanges(current:LearningSchedule|null,next:LearningSchedule){
 const before=planIdentity(current),after=planIdentity(next),sameId=before.planId===after.planId;
 const rows=(p:LearningSchedule|null)=>{const v=p?.proposalImport?.source.planningPolicy.taskSchedules;return Array.isArray(v)?v.filter((r):r is Record<string,unknown>=>!!r&&typeof r==='object'&&typeof r.taskId==='string').map(r=>[String(r.taskId),canonical(r)] as const):(p?.items??[]).map(r=>[r.taskId,canonical(r)] as const);};
 const old=new Map(sameId?rows(current):[]),fresh=new Map(rows(next));return{before,after,sameId,added:[...fresh.keys()].filter(k=>!old.has(k)).length,changed:[...fresh].filter(([k,v])=>old.has(k)&&old.get(k)!==v).length,removed:[...old.keys()].filter(k=>!fresh.has(k)).length,unchanged:[...fresh].filter(([k,v])=>old.get(k)===v).length};
}
