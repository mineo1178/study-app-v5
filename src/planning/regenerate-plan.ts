import {canonical,materialKey,type LearningSchedule,type ScheduleStage} from './schedule';
import {oldItem} from './official-schedule';
import {recoverySchedule} from './recovery-schedule';
import type {OfficialPlan} from './official-schema';
import type {PlanningTask} from './model';
import type {EventCalendar} from './events';

export function regeneratePlan({tasks,current,estimates,calendar,today,generatedAt,snapshotAt,revision}:{tasks:PlanningTask[];current:LearningSchedule;estimates:OfficialPlan;calendar:EventCalendar;today:string;generatedAt:string;snapshotAt:string;revision:number}){
 if(!current.proposalImport||revision<=Math.max(current.revision,estimates.revision)||!Number.isFinite(Date.parse(snapshotAt))||snapshotAt>generatedAt)throw Error('照合元・新revision・実績取得時点を確認してください。');
 const selected=[...new Map([...current.items.flatMap(i=>tasks.filter(t=>t.id===i.taskId)),...tasks.filter(t=>t.status!=='completed'&&['第11回','第12回'].includes(t.unit))].map(t=>[t.id,t])).values()];
 const source=structuredClone(current.proposalImport.source),rows=estimates.planningPolicy.taskSchedules;
 const estimatesByTask=selected.filter(t=>t.status!=='completed').map(task=>{
  const row=Array.isArray(rows)?rows.find(r=>r.taskId===task.id&&r.unit===task.unit&&r.subject===task.subject&&r.category===task.category&&r.materialName===task.materialName&&r.materialId===materialKey(task)):null;
  const workEstimate=Object.fromEntries(['first_and_marking','correction','final_check'].map(phase=>[phase,row?.phases?.filter((p:{phase:string})=>p.phase===phase).reduce((n:number,p:{minutes:number})=>n+p.minutes,0)??0]));
  return{taskId:task.id,unit:task.unit,subject:task.subject,category:task.category,materialName:task.materialName,materialId:materialKey(task),title:task.title,statusAtGeneration:task.status,workEstimate,availability:row?.availability??{notBefore:today,status:'配布日未確認'},scopeStatus:'unmeasured_not_assumed',estimateStatus:row?'旧全課題案の同一taskIdの仮見積を維持':'時間見積未確認',estimateSource:row?{planId:estimates.planId,revision:estimates.revision}:null,phases:[] as ScheduleStage[],recommendedEndDate:null as string|null};
 });
 source.revision=revision;source.generatedAt=generatedAt;
 source.rounds=estimates.rounds.map(r=>({...r,recommendedFirstPassEnd:null,recommendedCorrectionEnd:null}));
 source.planningPolicy={proposalWindowStart:today,proposalWindowEnd:'2026-11-20',dailyCapacitySeconds:null,initialCompletionDefinition:source.planningPolicy.initialCompletionDefinition,taskSchedules:estimatesByTask,adoptionDecision:{status:'guardian_review_required_for_schedule_revision',prioritySelectionStatus:'multi_round_recovery_v1',selectedTaskIds:selected.map(t=>t.id),completedTaskIds:selected.filter(t=>t.status==='completed').map(t=>t.id),pendingTaskIds:selected.filter(t=>t.status!=='completed').map(t=>t.id)},operationReadiness:{snapshotReadAt:snapshotAt,generatedAt,status:'not_adopted_requires_latest_account_review'},roundDeadlines:{'第11回':'2026-11-12','第12回':'2026-11-19'},dependencies:[],dependencyStatus:'未確認の前提関係は追加していない',estimatePolicy:{status:'provisional_existing_same_task_estimates',timeIsNotProgress:true},questionProgressPolicy:{status:'no_quantities_or_actuals_invented'}};
 const plan:LearningSchedule={...structuredClone(current),revision,generatedAt,baseVersion:current.planId+'--r'+current.revision,scope:[{unit:'第11回',subjects:['math','japanese','science','social'],deadline:'2026-11-12'},{unit:'第12回',subjects:['math','japanese','science','social'],deadline:'2026-11-19'}],proposalImport:{source,records:structuredClone(current.proposalImport.records)},provisional:true};
 const recovery=recoverySchedule(tasks,current,calendar,today,plan);
 plan.items=selected.map(task=>{
  const old=current.items.find(i=>i.taskId===task.id)??oldItem(task),stages:ScheduleStage[]=[];
  for(const a of recovery.allocations.filter(a=>a.taskId===task.id)){const phase=a.phase==='初回演習'||a.phase==='採点'?'first_and_marking':a.phase==='必要な直し'?'correction':'final_check',same=stages.find(s=>s.phase===phase&&s.day===a.day);if(same)same.minutes+=a.minutes;else stages.push({phase,day:a.day,minutes:a.minutes,conditional:phase==='correction'});}
  const endDay=stages.map(s=>s.day).sort().at(-1)??null,row=estimatesByTask.find(r=>r.taskId===task.id);
  if(row){row.phases=stages;row.recommendedEndDate=endDay;}
  return task.status==='completed'?structuredClone(old):{...structuredClone(old),stages,endDay};
 });
 source.planningPolicy.feasibilityStatus=recovery.unallocated>0?'capacity_exceeded_scope_unmeasured':'scope_unmeasured';
 source.planningPolicy.unplaced=recovery.jobs.flatMap(job=>{const phases=recovery.shortfalls.filter(s=>s.taskId===job.taskId);return phases.length?[{taskId:job.taskId,phases}]:[];});
 source.planningPolicy.recoverySummary={today,snapshotAt,knownMinutes:recovery.knownMinutes,unallocatedMinutes:recovery.unallocated,unknownTasks:recovery.unknown.length,ledger:recovery.ledger,formalDeadlinesUnchanged:true};
 plan.notes=['未採用。利用者の明示採用前に本番の青い予定を変更しません。','第11回の正式期限11/12を保持。将来工程は期限超過後の回復予定。第12回は11/19までの既知容量を先に使用。','仮見積の全作業を短縮せず、不足工程は未配置として保持。固定目標・学習実績・手動予定を変更しません。'];
 plan.gaps=[`実績取得時点：${snapshotAt}。生成日時とは別。新しい実績があれば再生成。`,`既知必要${recovery.knownMinutes}分・未配置${recovery.unallocated}分。未確認${recovery.unknown.length}課題。全課題の期限内完了を保証しません。`,'総問題数・演習・採点・直しの数量と教材対応が未確認。ページ数を問題数として扱いません。'];
 const diff=plan.items.map(item=>{const old=current.items.find(i=>i.taskId===item.taskId);return{taskId:item.taskId,unit:item.unit,title:item.title,before:old?.stages??[],after:item.stages??[],oldEnd:old?.endDay??null,newEnd:item.endDay,baselinePreserved:!old||canonical(old.baseline)===canonical(item.baseline),remainingMinutes:recovery.jobs.find(j=>j.taskId===item.taskId)?.phases.reduce((n,p)=>n+p.minutes,0)??0};});
 return{plan,recovery,diff};
}
