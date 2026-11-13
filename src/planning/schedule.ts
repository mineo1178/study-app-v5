import { oldItem,reconciliationErrors } from './official-schedule';
import { parseProposalImport, type ProposalImport } from './official-schema';
import type { PlanningTask } from './model';
import { difference, validDay } from './model';
import { SUBJECTS, type Subject } from '../review/model';
export type ScheduleRange = { id: string; label: string; units: number; minutes: number; day: string | null };
export type ScheduleStage={phase:'first_and_marking'|'correction'|'final_check';day:string;minutes:number;conditional:boolean};
export type ScheduleItem = { stages?:ScheduleStage[]; taskId: string; unit: string; subject: Subject; category: string; materialName: string; materialId: string; title: string; endDay: string | null; deadline: string | null; ranges: ScheduleRange[]; dailyWork: Record<string,{units:number;minutes:number}>; baseline: { id:string; targetDay:string|null; daily:Record<string,number>; evidence:{provisional:boolean;historyCount:number;estimatedMinutes:number|null;method:string;conditions:string[];manualAdjustmentMinutes:number|null;historyRefs?:string[]} } };
export type LearningSchedule = { baseVersion?:string|null; proposalImport?:ProposalImport; schemaVersion:'learning-schedule/1'; planId:string; revision:number; generatedAt:string; accountBinding:string|null; provisional:boolean; notes:string[]; gaps:string[]; scope:{unit:string;subjects:Subject[];deadline:string|null}[]; capacities:Record<string,number>; items:ScheduleItem[] };
export type ScheduleActual = { done:boolean; graded:boolean; corrected:boolean; actualDay:string|null; recordedAt:number; label:string; units:number };
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=200):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
export const scheduleId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const day=(v:unknown)=>v===null||(typeof v==='string'&&validDay(v));
const num=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const strings=(v:unknown,max=30):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(t=>text(t,600));
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
export const canonical=(value:unknown):string=>JSON.stringify(value,(_k,v)=>obj(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const materialKey=(task:PlanningTask)=>task.planning?.material?.materialId??'legacy-'+task.id;
export function parseSchedule(raw:string):LearningSchedule {
 if(new TextEncoder().encode(raw).length>150000)throw new Error('計画ファイルは150KBまでです。');
 let p:unknown;try{p=JSON.parse(raw);}catch{throw new Error('計画JSONの構文を確認してください。');}
 if(!obj(p)||!keys(p,['schemaVersion','planId','revision','generatedAt','accountBinding','provisional','notes','gaps','scope','capacities','items','proposalImport','baseVersion'])||p.schemaVersion!=='learning-schedule/1'||!scheduleId(p.planId)||!Number.isSafeInteger(p.revision)||Number(p.revision)<1||Number(p.revision)>1000000||!text(p.generatedAt,40)||!Number.isFinite(Date.parse(p.generatedAt))||(p.accountBinding!==null&&!(typeof p.accountBinding==='string'&&/^[a-f0-9]{64}$/.test(p.accountBinding)))||typeof p.provisional!=='boolean'||!strings(p.notes)||!strings(p.gaps)||!Array.isArray(p.scope)||!p.scope.length||p.scope.length>20||!obj(p.capacities)||Object.keys(p.capacities).length>366||!Array.isArray(p.items)||(!p.items.length&&!p.proposalImport)||p.items.length>100)throw new Error('schemaVersion・planId・revision・対象・学習可能時間を確認してください。');
 if(p.scope.some(s=>!obj(s)||!keys(s,['unit','subjects','deadline'])||!text(s.unit,100)||!Array.isArray(s.subjects)||!s.subjects.length||s.subjects.some(v=>typeof v!=='string'||!Object.hasOwn(SUBJECTS,v))||!day(s.deadline)))throw new Error('対象の回・教科・締切の形式が不正です。');
 if(Object.entries(p.capacities).some(([d,m])=>!validDay(d)||!Number.isInteger(m)||!num(m,0,1440)))throw new Error('学習可能時間は日付ごとの0〜1440分で指定してください。');
 if(p.proposalImport!==undefined){parseProposalImport(p.proposalImport);if(!(p.baseVersion===null||typeof p.baseVersion==='string'&&p.baseVersion.length<=220))throw new Error('照合元の採用revisionを確認してください。');}
 const taskIds=new Set<string>(),rangeIds=new Set<string>();
 for(const [index,item]of p.items.entries()){
  const where='課題'+(index+1)+'：';
  if(!obj(item)||!keys(item,['taskId','unit','subject','category','materialName','materialId','title','endDay','deadline','ranges','dailyWork','baseline','stages'])||!text(item.taskId,200)||item.taskId.includes('/')||![item.unit,item.category,item.materialName,item.materialId,item.title].every(v=>text(v,200))||typeof item.subject!=='string'||!Object.hasOwn(SUBJECTS,item.subject)||!day(item.endDay)||!day(item.deadline)||!Array.isArray(item.ranges)||item.ranges.length>30||!obj(item.dailyWork)||!obj(item.baseline))throw new Error(where+'taskId・教材・日付・範囲を確認してください。');
  if(item.stages!==undefined&&(!Array.isArray(item.stages)||item.stages.length>30||item.stages.some(s=>!obj(s)||!keys(s,['phase','day','minutes','conditional'])||!['first_and_marking','correction','final_check'].includes(String(s.phase))||typeof s.day!=='string'||!validDay(s.day)||!num(s.minutes,1,1440)||typeof s.conditional!=='boolean')||new Set(item.stages.map(s=>s.phase+':'+s.day)).size!==item.stages.length||item.stages.some(s=>item.endDay!==null&&s.day>String(item.endDay))))throw new Error(where+'工程の形式・重複・終了日を確認してください。');
  if(taskIds.has(item.taskId))throw new Error(where+'同じtaskIdが重複しています。分割範囲は1課題へまとめてください。');taskIds.add(item.taskId);
  if(!p.scope.some(s=>obj(s)&&s.unit===item.unit&&Array.isArray(s.subjects)&&s.subjects.includes(item.subject)))throw new Error(where+'対象の回・教科に含まれていません。');
  const work:Record<string,{units:number;minutes:number}>={};
  for(const r of item.ranges){
   if(!obj(r)||!keys(r,['id','label','units','minutes','day'])||!scheduleId(r.id)||!text(r.label,150)||!num(r.units,.01,10000)||!num(r.minutes,1,1440)||!day(r.day))throw new Error(where+'範囲ID・作業量・予定時間・予定日が不正です。');
   if(rangeIds.has(r.id))throw new Error(where+'範囲IDが重複しています。');rangeIds.add(r.id);
   if(r.day){const d=String(r.day);work[d]??={units:0,minutes:0};work[d].units+=Number(r.units);work[d].minutes+=Number(r.minutes);}
  }
  const savedWork=item.dailyWork;
  if(Object.keys(work).length!==Object.keys(item.dailyWork).length||Object.entries(work).some(([d,w])=>{const saved=savedWork[d];return !obj(saved)||!keys(saved,['units','minutes'])||!num(saved.units,0,300000)||!num(saved.minutes,0,43200)||Math.abs(Number(saved.units)-w.units)>1e-6||Math.abs(Number(saved.minutes)-w.minutes)>1e-6;}))throw new Error(where+'日別予定作業量が分割範囲の合計と一致しません。');
  const b=item.baseline,e=b.evidence;
  if(!keys(b,['id','targetDay','daily','evidence'])||!scheduleId(b.id)||!day(b.targetDay)||!obj(b.daily)||Object.keys(b.daily).length>366||Object.entries(b.daily).some(([d,w])=>!validDay(d)||!num(w,0,100))||!obj(e)||!keys(e,['provisional','historyCount','estimatedMinutes','method','conditions','manualAdjustmentMinutes','historyRefs'])||(e.historyRefs!==undefined&&!strings(e.historyRefs,100))||typeof e.provisional!=='boolean'||!Number.isInteger(e.historyCount)||!num(e.historyCount,0,100000)||!(e.estimatedMinutes===null||num(e.estimatedMinutes,1,100000))||!text(e.method,600)||!strings(e.conditions,15)||!(e.manualAdjustmentMinutes===null||num(e.manualAdjustmentMinutes,1,100000)))throw new Error(where+'固定目標・推定根拠の形式が不正です。');
  const total=Object.values(b.daily).reduce<number>((n,w)=>n+Number(w),0);if((b.targetDay===null&&total!==0)||(b.targetDay!==null&&(Math.abs(total-100)>1e-5||!Object.hasOwn(b.daily,String(b.targetDay)))))throw new Error(where+'目標日と固定基準の日別割合が一致しません。');
 }
 return p as unknown as LearningSchedule;
}
export function scheduleErrors(plan:LearningSchedule,tasks:PlanningTask[],accountBinding?:string):string[]{
 const errors:string[]=plan.proposalImport?reconciliationErrors(plan.proposalImport,tasks,accountBinding??''):[];if(plan.accountBinding&&plan.accountBinding!==accountBinding)errors.push('計画のアカウント識別子が現在の認証アカウントと一致しません。');
 for(const item of plan.items){const t=tasks.find(t=>t.id===item.taskId);if(!t){errors.push('未知のtaskId：'+item.taskId+'（'+item.title+'）');continue;}if(item.stages?.length){if(t.status==='completed')errors.push(item.title+'：完了済みです。再実施工程を外した新revisionを確認してください。');const first=item.stages.map(s=>s.day).sort()[0],manual=t.planning?.wbs;if((manual?.startDay&&manual.startDay!==first)||(manual?.endDay&&manual.endDay!==item.endDay)||(t.planning?.endDay&&t.planning.endDay!==item.endDay))errors.push(item.title+'：既存手動予定との競合があります。上書きせず確認してください。');if(t.planning?.baseline&&canonical(item.baseline)!==canonical(oldItem(t).baseline))errors.push(item.title+'：既存固定目標を保持してください。');}for(const k of ['unit','subject','category','materialName']as const)if(t[k]!==item[k])errors.push(item.title+'：'+k+'が既存タスクと一致しません。');for(const r of item.ranges){const a=actualOf(t,r.id);if(a&&(a.label!==r.label||a.units!==r.units))errors.push(item.title+'：実績のある範囲IDの意味・作業量は変更できません。新しい範囲IDを使ってください。');}if(materialKey(t)!==item.materialId)errors.push(item.title+'：教材識別子が一致しません。');}
 return errors;
}
export function scheduleDiff(next:LearningSchedule,current:LearningSchedule|null){const old=new Map(current?.items.map(i=>[i.taskId,i])??[]);return{added:next.items.filter(i=>!old.has(i.taskId)).length,changed:next.items.filter(i=>old.has(i.taskId)&&canonical(old.get(i.taskId))!==canonical(i)).length,unchanged:next.items.filter(i=>canonical(old.get(i.taskId))===canonical(i)).length,removed:current?.items.filter(i=>!next.items.some(n=>n.taskId===i.taskId)).length??0};}
export function stageImportConflicts(next:LearningSchedule,current:LearningSchedule|null){
 if(!next.items.some(i=>i.stages?.length))return[];
 return(current?.items??[]).flatMap(old=>{const item=next.items.find(i=>i.taskId===old.taskId),errors:string[]=[];if(old.baseline.targetDay&&(!item||canonical(item.baseline)!==canonical(old.baseline)))errors.push(old.title+'：採用済み固定目標を保持してください。');if(old.endDay&&!old.stages?.length&&(!item||item.endDay!==old.endDay))errors.push(old.title+'：既存採用予定との競合があります。');return errors;});
}
export async function scheduleDigest(plan:LearningSchedule){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(plan)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export async function accountKey(project:string,family:string,uid:string){return scheduleDigest({project,family,uid} as unknown as LearningSchedule);}
export function actualOf(task:PlanningTask,rangeId:string):ScheduleActual|null {const actual=task.scheduleActuals?.[rangeId];if(actual)return actual;const old=task.planning?.ranges.find(r=>r.id===rangeId);return old?{done:old.done,graded:old.graded,corrected:old.corrected,actualDay:old.actualDay,recordedAt:0,label:old.label,units:old.units}:null;}
export function scheduleProgress(task:PlanningTask,item:ScheduleItem):number|null {if(task.status==='completed')return 100;const total=item.ranges.reduce((n,r)=>n+r.units,0);if(!total||!item.ranges.some(r=>actualOf(task,r.id)))return null;return 100*item.ranges.reduce((n,r)=>{const a=actualOf(task,r.id);return n+(a?.done&&a.graded&&a.corrected?r.units:0);},0)/total;}
export function scheduleDaily(item:ScheduleItem){const total=item.ranges.reduce((n,r)=>n+r.units,0);return Object.fromEntries(Object.entries(item.dailyWork).map(([d,w])=>[d,total?w.units/total*100:0]));}
export function scheduleDifference(task:PlanningTask,item:ScheduleItem,today:string){const progress=scheduleProgress(task,item);return{progress,manual:difference(progress,scheduleDaily(item),today),goal:difference(progress,item.baseline.daily,today)};}
