import {readOfficialFile} from './official-schedule';
import {referencePlan} from './schedule-reference';
import {canonical,parseSchedule,scheduleErrors,stageImportConflicts,type LearningSchedule} from './schedule';
import type {PlanningTask} from './model';

function approvedStages(plan:LearningSchedule,tasks:PlanningTask[]){
 const source=plan.proposalImport?.source;
 const decision=source?.planningPolicy.adoptionDecision as {
  status?:string;selectedTaskIds?:string[];completedTaskIds?:string[];pendingTaskIds?:string[];
 }|undefined;
 if(source?.planId!==plan.planId||decision?.status!=='guardian_selected_priority_plan')throw Error('工程の採用方針を確認できません。詳細管理で差分を確認してください。');
 const selected=decision.selectedTaskIds,completed=decision.completedTaskIds,pending=decision.pendingTaskIds;
 if(!Array.isArray(selected)||!Array.isArray(completed)||!Array.isArray(pending)||new Set(selected).size!==selected.length||selected.length!==plan.items.length||plan.items.some(item=>!selected.includes(item.taskId)))throw Error('選択済み課題と取込対象が一致しません。');
 if(selected.length!==10||completed.length!==1||pending.length!==9||plan.items.some(item=>item.unit!=='第11回'))throw Error('第11回B案10課題・工程9課題を確認してください。');
 if(plan.proposalImport!.records.some(record=>record.selected||record.adoptRecommendation||record.adoptHistoryTarget))throw Error('未確認教材の採用設定が含まれています。詳細管理で確認してください。');
 const schedules=source.planningPolicy.taskSchedules;
 if(!Array.isArray(schedules)||schedules.length!==pending.length)throw Error('採用対象の工程数が一致しません。');
 for(const item of plan.items){
  const task=tasks.find(task=>task.id===item.taskId);
  if(!task)throw Error('対象taskIdを確認できません。');
  if(completed.includes(item.taskId)){
   if(task.status!=='completed'||item.stages?.length)throw Error('完了状態が変更されています。最新の課題から計画を更新してください。');
  }else{
   const saved=schedules.find(row=>row&&row.taskId===item.taskId);
   if(!pending.includes(item.taskId)||!saved||saved.statusAtGeneration!==task.status||!item.stages?.length)throw Error('課題の実績状態または工程が変更されています。最新の計画を確認してください。');
   for(const key of ['unit','subject','category','materialName','materialId','title'] as const)if(saved[key]!==item[key])throw Error('工程の課題識別が一致しません。');
   const phases=Array.isArray(saved.phases)?saved.phases.map((phase:Record<string,unknown>)=>({phase:phase.phase,day:phase.day,minutes:phase.minutes,conditional:phase.conditional})):[];
   if(canonical(phases)!==canonical(item.stages)||saved.recommendedEndDate!==item.endDay)throw Error('採用済みの工程案と日付が一致しません。');
  }
 }
}

export function prepareScheduleFile(raw:string,tasks:PlanningTask[],current:LearningSchedule|null,binding:string){
 if(!binding)throw Error('認証アカウントを確認してください。');
 if(new TextEncoder().encode(raw).length>150000)throw Error('計画ファイルは150KBまでです。');
 let data:unknown;
 try{data=JSON.parse(raw);}catch{throw Error('計画JSONの構文を確認してください。');}
 const native=!!data&&typeof data==='object'&&'schemaVersion' in data&&data.schemaVersion==='learning-schedule/1';
 let plan:LearningSchedule,referenceOnly=false;
 if(native){
  plan=parseSchedule(raw);
  if(!plan.accountBinding||plan.accountBinding!==binding)throw Error('計画のアカウント識別子が現在の認証アカウントと一致しません。');
  if(plan.proposalImport&&!plan.items.some(item=>item.stages?.length)){
   plan=referencePlan(plan.proposalImport.source,tasks,current,binding);
   referenceOnly=true;
  }
 }else{
  const source=readOfficialFile(raw,binding).source;
  plan=referencePlan(source,tasks,current,binding);
  referenceOnly=true;
 }
 const same=current?.planId===plan.planId&&current.revision===plan.revision;
 if(same&&canonical(current)!==canonical(plan))throw Error('同じrevisionの内容が変更されています。revisionを増やしてください。');
 if(current?.planId===plan.planId&&plan.revision<current.revision)throw Error('旧revisionは取り込めません。');
 const duplicate=!!same&&canonical(current)===canonical(plan);
 const errors=[...scheduleErrors(plan,tasks,binding),...stageImportConflicts(plan,current)];
 if(errors.length)throw Error(errors.join('\n'));
 if(!duplicate&&plan.proposalImport&&plan.baseVersion!==(current?current.planId+'--r'+current.revision:null))throw Error('採用済み計画が更新されています。最新計画からファイルを更新してください。');
 if(!referenceOnly&&plan.items.some(item=>item.stages?.length))approvedStages(plan,tasks);
 if(!referenceOnly&&!duplicate){
  const removed=current?.items.filter(old=>!plan.items.some(item=>item.taskId===old.taskId)&&(old.endDay||old.ranges.length||old.stages?.length||old.baseline.targetDay))??[];
  if(removed.length)throw Error('既存の採用予定が対象から外れます。詳細管理で確認してください。');
 }
 return {plan,referenceOnly,duplicate,scheduledCount:plan.items.filter(item=>item.stages?.length).length};
}
