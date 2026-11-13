import type { PlanningTask } from './model';
import { displayItem,endDisplay,targetDisplay,measuredProgress,dayDisplay } from './gantt-display';
import type { LearningSchedule } from './schedule';
export const compareRounds=(a:string,b:string)=>{const number=(v:string)=>Number(v.match(/第\s*([0-9０-９]+)\s*回/)?.[1].normalize('NFKC'));const x=number(a),y=number(b);return Number.isFinite(x)&&Number.isFinite(y)?y-x: Number.isFinite(x)?-1:Number.isFinite(y)?1:b.localeCompare(a,'ja',{numeric:true});};
export const taskCounts=(input:PlanningTask[])=>{const tasks=[...new Map(input.map(t=>[t.id,t])).values()];return({total:tasks.length,completed:tasks.filter(t=>t.status==='completed').length,inProgress:tasks.filter(t=>t.status==='in_progress').length,notStarted:tasks.filter(t=>t.status==='not_started').length});};
export type GanttRow={key:string;kind:'unit'|'subject'|'material'|'task';depth:number;label:string;tasks:PlanningTask[];task?:PlanningTask};
export function ganttRows(tasks:PlanningTask[],plan:LearningSchedule|null,collapsed:ReadonlySet<string>=new Set()):GanttRow[]{
 const rows:GanttRow[]=[],units=[...new Set([...tasks.map(t=>t.unit),...plan?.scope.map(s=>s.unit)??[]])].sort(compareRounds);
 tasks=[...new Map(tasks.map(t=>[t.id,t])).values()];
 for(const unit of units){const children=tasks.filter(t=>t.unit===unit),key=JSON.stringify(['unit',unit]);rows.push({key,kind:'unit',depth:0,label:unit,tasks:children});if(collapsed.has(key))continue;
 for(const subject of [...new Set(children.map(t=>t.subject))].sort((a,b)=>{const order=['math','japanese','science','social'];return (order.includes(a)?order.indexOf(a):4)-(order.includes(b)?order.indexOf(b):4);})){const subjects=children.filter(t=>t.subject===subject),subjectKey=JSON.stringify(['subject',unit,subject]);rows.push({key:subjectKey,kind:'subject',depth:1,label:subject,tasks:subjects});if(collapsed.has(subjectKey))continue;
 for(const material of [...new Set(subjects.map(t=>t.materialName||t.category))]){const materials=subjects.filter(t=>(t.materialName||t.category)===material),materialKey=JSON.stringify(['material',unit,subject,material]);if(materials.length>1){rows.push({key:materialKey,kind:'material',depth:2,label:material,tasks:materials});if(collapsed.has(materialKey))continue;}for(const task of materials)rows.push({key:'task-'+task.id,kind:'task',depth:materials.length>1?3:2,label:materials.length===1?material===task.title||material.endsWith(' - '+task.title)||material.endsWith('／'+task.title)?material:material+' ／ '+task.title:task.title,tasks:[task],task});}
 }}return rows;
}
export function contiguousRuns(flags:boolean[]){const runs:{start:number;end:number}[]=[];for(let i=0;i<flags.length;i++){if(!flags[i])continue;const start=i;while(i+1<flags.length&&flags[i+1])i++;runs.push({start,end:i});}return runs;}
export function gridSummary(tasks:PlanningTask[],plan:LearningSchedule|null,today:string){
 const measured=tasks.map(t=>{const item=displayItem(t,plan);return{value:measuredProgress(t,item),weight:item.ranges.reduce((n,r)=>n+r.minutes,0)};}),weight=measured.reduce((n,m)=>n+m.weight,0);
 // Preserve the existing planned-minute weighting, including adopted schedule ranges.
 const progress=measured.length&&Number.isFinite(weight)&&measured.every(m=>m.value!==null&&Number.isFinite(m.value)&&m.weight>0&&Number.isFinite(m.weight))?measured.reduce((n,m)=>n+m.value!*m.weight,0)/weight:null;
 const ends=tasks.map(t=>endDisplay(t,plan).day),targets=tasks.map(t=>targetDisplay(t,plan,tasks,today));
 return{progress,end:ends.length&&ends.every(Boolean)?ends.reduce((a,b)=>a!>b!?a:b):null,target:targets.length&&targets.every(t=>t.day&&t.label==='固定目標')?targets.map(t=>t.day!).sort().at(-1)!:null};
}
export function gridDay(tasks:PlanningTask[],plan:LearningSchedule|null,day:string){const facts=tasks.map(t=>dayDisplay(t,displayItem(t,plan),plan,day));return{planned:facts.some(f=>f.planned),actual:facts.some(f=>f.actual),knownMinutes:facts.reduce((n,f)=>n+(f.minutes??0),0),unknown: facts.some(f=>f.planned&&f.minutes===null),seconds:facts.reduce((n,f)=>n+f.seconds,0),actualRanges:facts.reduce((n,f)=>n+f.actualRanges,0)};}
