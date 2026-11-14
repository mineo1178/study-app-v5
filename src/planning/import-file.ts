import {readOfficialFile} from './official-schedule';
import {referencePlan} from './schedule-reference';
import {MAX_SCHEDULE_BYTES,canonical,parseSchedule,scheduleErrors,stageImportConflicts,type LearningSchedule} from './schedule';
import type {PlanningTask} from './model';
export {MAX_SCHEDULE_BYTES} from './schedule';

function approvedStages(plan:LearningSchedule,tasks:PlanningTask[],current:LearningSchedule|null,reviewPending=false){
 const source=plan.proposalImport?.source;
 const decision=source?.planningPolicy.adoptionDecision as {
  status?:string;prioritySelectionStatus?:string;selectedTaskIds?:string[];completedTaskIds?:string[];pendingTaskIds?:string[];
 }|undefined;
 if(decision?.status==='guardian_review_required_for_schedule_revision'&&decision.prioritySelectionStatus==='multi_round_recovery_v1'){
  if(!current||current.planId!==plan.planId||source?.planId!==plan.planId)throw Error('回復案の照合元計画を確認してください。');
  const selected=decision.selectedTaskIds,completed=decision.completedTaskIds,pending=decision.pendingTaskIds,rows=source.planningPolicy.taskSchedules;
  if(!Array.isArray(selected)||!Array.isArray(completed)||!Array.isArray(pending)||!Array.isArray(rows)||new Set(selected).size!==selected.length||new Set(pending).size!==pending.length||new Set(completed).size!==completed.length||selected.length!==plan.items.length||selected.length!==pending.length+completed.length||rows.length!==pending.length||new Set(rows.map(r=>r.taskId)).size!==rows.length||plan.items.some(i=>!selected.includes(i.taskId))||tasks.some(t=>t.status!=='completed'&&['第11回','第12回'].includes(t.unit)&&!pending.includes(t.id)))throw Error('全未完了課題・選択対象・工程の対応を確認してください。');
  if(plan.scope.find(s=>s.unit==='第11回')?.deadline!=='2026-11-12'||plan.scope.find(s=>s.unit==='第12回')?.deadline!=='2026-11-19')throw Error('第11回11/12・第12回11/19の正式期限を保持してください。');
  if(current.items.some(old=>{const next=plan.items.find(i=>i.taskId===old.taskId);return!next||canonical(next.baseline)!==canonical(old.baseline)||next.deadline!==old.deadline;}))throw Error('既存課題・固定目標・課題別期限を保持してください。');
  if(plan.proposalImport!.records.some(r=>r.selected||r.adoptRecommendation||r.adoptHistoryTarget))throw Error('未確認教材・固定目標の採用は別に確認してください。');
  const used:Record<string,number>={};
  for(const item of plan.items){const task=tasks.find(t=>t.id===item.taskId),row=rows.find(r=>r.taskId===item.taskId);
   if(!task||!['第11回','第12回'].includes(item.unit))throw Error('対象回・taskIdを確認してください。');
   if(task.status==='completed'){if(!completed.includes(item.taskId)||pending.includes(item.taskId)||item.stages?.length)throw Error('完了済み課題を残作業に含めないでください。');continue;}
   if(!pending.includes(item.taskId)||completed.includes(item.taskId)||!row||row.statusAtGeneration!==task.status||['unit','subject','category','materialName','materialId','title'].some(k=>row[k]!==item[k as keyof typeof item])||canonical(row.phases)!==canonical(item.stages??[])||row.recommendedEndDate!==item.endDay)throw Error('課題・工程・残作業の照合が一致しません。');
   const work=row.workEstimate as Record<string,unknown>|undefined;
   if(!work||['first_and_marking','correction','final_check'].some(k=>typeof work[k]!=='number'||!Number.isFinite(work[k])||Number(work[k])<0||Number(work[k])>100000))throw Error('仮見積と未配置作業の根拠を確認してください。');
   for(const phase of ['first_and_marking','correction','final_check'])if((item.stages??[]).filter(s=>s.phase===phase).reduce((n,s)=>n+s.minutes,0)>Number(work[phase]))throw Error('残見積を超える工程があります。');
   for(const stage of item.stages??[]){if(stage.day<(row.availability?.notBefore??'0001-01-01')||item.unit==='第12回'&&stage.day>'2026-11-19')throw Error('利用可能日・第12回の正式期限を確認してください。');used[stage.day]=(used[stage.day]??0)+stage.minutes;}
  }
  if(Object.entries(used).some(([day,minutes])=>plan.capacities[day]===undefined||minutes>plan.capacities[day]))throw Error('全回共通の学習容量を超えています。');
  return;
 }
 if(source?.planId!==plan.planId||!(decision?.status==='guardian_selected_priority_plan'||reviewPending&&decision?.status==='guardian_review_required_for_schedule_revision'&&decision.prioritySelectionStatus==='B_ten_task_priority_unchanged_from_adopted_r3'))throw Error('工程の採用方針を確認できません。詳細管理で差分を確認してください。');
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
 if(new TextEncoder().encode(raw).length>MAX_SCHEDULE_BYTES)throw Error('計画ファイルは500KBまでです。');
 let data:unknown;
 try{data=JSON.parse(raw);}catch{throw Error('計画JSONの構文を確認してください。');}
 const native=!!data&&typeof data==='object'&&'schemaVersion' in data&&data.schemaVersion==='learning-schedule/1';
 let plan:LearningSchedule,referenceOnly=false;
 if(native){
  plan=parseSchedule(raw);
  if(!plan.accountBinding||plan.accountBinding!==binding)throw Error('計画のアカウント識別子が現在の認証アカウントと一致しません。');
  if(plan.proposalImport&&!plan.items.some(item=>item.stages?.length)&&(plan.proposalImport.source.planningPolicy.adoptionDecision as {prioritySelectionStatus?:string}|undefined)?.prioritySelectionStatus!=='multi_round_recovery_v1'){
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
 const decision=plan.proposalImport?.source.planningPolicy.adoptionDecision as {status?:string}|undefined;const requiresApproval=!referenceOnly&&!duplicate;if(requiresApproval&&decision?.status==='guardian_review_required_for_schedule_revision'&&current?.planId!==plan.planId)throw Error('回復案の照合元計画が一致しません。');
 if(!referenceOnly&&(plan.items.some(item=>item.stages?.length)||(plan.proposalImport?.source.planningPolicy.adoptionDecision as {prioritySelectionStatus?:string}|undefined)?.prioritySelectionStatus==='multi_round_recovery_v1'))approvedStages(plan,tasks,current,requiresApproval||!!duplicate&&decision?.status==='guardian_review_required_for_schedule_revision');
 if(!referenceOnly&&!duplicate){
  const removed=current?.items.filter(old=>!plan.items.some(item=>item.taskId===old.taskId)&&(old.endDay||old.ranges.length||old.stages?.length||old.baseline.targetDay))??[];
  if(removed.length)throw Error('既存の採用予定が対象から外れます。詳細管理で確認してください。');
 }
 return {plan,referenceOnly,duplicate,requiresApproval,scheduledCount:plan.items.filter(item=>item.stages?.length).length};
}
