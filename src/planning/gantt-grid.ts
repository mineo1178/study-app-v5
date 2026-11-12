import type { PlanningTask } from './model';
import { progressOf } from './model';
import { displayItem,endDisplay,targetDisplay,measuredAggregate,measuredProgress,dayDisplay } from './gantt-display';
import type { LearningSchedule } from './schedule';
export type GanttRow={key:string;kind:'unit'|'subject'|'material'|'task';depth:number;label:string;tasks:PlanningTask[];task?:PlanningTask};
export function ganttRows(tasks:PlanningTask[],plan:LearningSchedule|null,collapsed:ReadonlySet<string>=new Set()):GanttRow[]{
 const rows:GanttRow[]=[],units=[...new Set([...tasks.map(t=>t.unit),...plan?.scope.map(s=>s.unit)??[]])].sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));
 for(const unit of units){const children=tasks.filter(t=>t.unit===unit),key=JSON.stringify(['unit',unit]);rows.push({key,kind:'unit',depth:0,label:unit,tasks:children});if(collapsed.has(key))continue;
 for(const subject of [...new Set(children.map(t=>t.subject))]){const subjects=children.filter(t=>t.subject===subject),subjectKey=JSON.stringify(['subject',unit,subject]);rows.push({key:subjectKey,kind:'subject',depth:1,label:subject,tasks:subjects});if(collapsed.has(subjectKey))continue;
 for(const material of [...new Set(subjects.map(t=>t.materialName||t.category))]){const materials=subjects.filter(t=>(t.materialName||t.category)===material),materialKey=JSON.stringify(['material',unit,subject,material]);rows.push({key:materialKey,kind:'material',depth:2,label:material,tasks:materials});if(collapsed.has(materialKey))continue;for(const task of materials)rows.push({key:'task-'+task.id,kind:'task',depth:3,label:task.title,tasks:[task],task});}
 }}return rows;
}
export function contiguousRuns(flags:boolean[]){const runs:{start:number;end:number}[]=[];for(let i=0;i<flags.length;i++){if(!flags[i])continue;const start=i;while(i+1<flags.length&&flags[i+1])i++;runs.push({start,end:i});}return runs;}
export function gridSummary(tasks:PlanningTask[],plan:LearningSchedule|null,today:string){
 const progress=tasks.length&&tasks.every(t=>t.status==='completed')?100:tasks.length&&tasks.every(t=>measuredProgress(t,displayItem(t,plan))===progressOf(t))?measuredAggregate(tasks):null;
 const ends=tasks.map(t=>endDisplay(t,plan).day),targets=tasks.map(t=>targetDisplay(t,plan,tasks,today));
 return{progress,end:ends.length&&ends.every(Boolean)?ends.reduce((a,b)=>a!>b!?a:b):null,target:targets.length&&targets.every(t=>t.day&&t.label==='固定目標')?targets.map(t=>t.day!).sort().at(-1)!:null};
}
export function gridDay(tasks:PlanningTask[],plan:LearningSchedule|null,day:string){const facts=tasks.map(t=>dayDisplay(t,displayItem(t,plan),plan,day));return{planned:facts.some(f=>f.planned),actual:facts.some(f=>f.actual),knownMinutes:facts.reduce((n,f)=>n+(f.minutes??0),0),unknown: facts.some(f=>f.planned&&f.minutes===null),seconds:facts.reduce((n,f)=>n+f.seconds,0),actualRanges:facts.reduce((n,f)=>n+f.actualRanges,0)};}
