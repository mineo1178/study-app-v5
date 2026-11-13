import {validateQuestionMeasurement,validateQuestionPlan,type QuestionMeasurement,type QuestionPlan,type QuestionGoal} from './question-progress';
import type { ScheduleActual } from "./schedule";
import { getJstDay } from "../review/model";

export type WbsEdit={taskId:string;startDay:string;endDay:string;progress:number|null;updatedBy:string;updatedAt:number};
export function validateWbs(value:WbsEdit){
 if(!value.taskId||!value.updatedBy||!Number.isFinite(value.updatedAt)||value.updatedAt<=0||[value.startDay,value.endDay].some(d=>d!==''&&!validDay(d))||(value.startDay&&value.endDay&&value.endDay<value.startDay)||(value.progress!==null&&(!Number.isFinite(value.progress)||value.progress<0||value.progress>100)))throw Error('開始日・終了日の順序と進捗率（0〜100%）を確認してください。');
}

export type PlanRange = { id: string; label: string; units: number; minutes: number; day: string; done: boolean; graded: boolean; corrected: boolean; actualDay: string | null; actualSeconds: number | null };
export type Evidence = { source: string; count: number; firstCount?: number; redoCount?: number; estimatedMinutes?: number | null; redoDaysKnown?: boolean; firstSeconds: number | null; redoSeconds: number | null; redoDays: number; conditions: string; manualMinutes: number | null; provisional: boolean };
export type Baseline = { id: string; createdDay: string; targetDay: string | null; daily: Record<string, number>; evidence: Evidence; basisStatus?:'unmeasured'|'measured_work' };
export type TargetRevision = { id:string; revision:number; changedAt:number; reason:string; memo:string; oldTargetDay:string|null; newTargetDay:string; previousBaseline:unknown; sourceVersion:string|null; phases?:{phase:string;day:string;minutes:number;conditional:boolean}[] };
export type RangeCorrection = { id: string; day: string; reason: string; baselineId: string | null; previousRanges: PlanRange[]; revisedRanges: PlanRange[] };
export type TaskPlan = { questionMeasurement?:QuestionMeasurement;questionMeasurementHistory?:QuestionMeasurement[];questionPlan?:QuestionPlan;questionPlanHistory?:QuestionPlan[];questionGoal?:QuestionGoal;questionGoalHistory?:QuestionGoal[]; wbs?: WbsEdit; targetRevisions?:TargetRevision[]; rangeCorrections?: RangeCorrection[]; schemaVersion: 1; revision: number; order?: number; endDay: string; deadline: string; ranges: PlanRange[]; baseline: Baseline | null; baselineHistory: Baseline[]; material?: { materialId: string; title: string; requirement: "required" | "reinforcement" | "advanced"; selected: boolean; references: string[] } };
export type PlanningTask = { scheduleActuals?: Record<string,ScheduleActual>; id: string; unit: string; subject: string; category: string; materialName: string; title: string; status: "not_started" | "in_progress" | "completed"; isRunning: boolean; currentDuration?: number; planning?: TaskPlan; history: { duration: number; operationCheck?: boolean; reviewStatus?: string; score?: number; graded?: boolean; attemptType?: string; units?: number; endAt?: number; date?: string }[] };
export const emptyPlan = (): TaskPlan => ({ schemaVersion: 1, revision: 0, order: 0, endDay: "", deadline: "", ranges: [], baseline: null, baselineHistory: [] });
export const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
export const addDays = (day: string, days: number) => new Date(Date.parse(day) + days * 86400000).toISOString().slice(0, 10);
export const monday = (day: string) => addDays(day, -((new Date(day).getUTCDay() + 6) % 7));
export const rangeComplete = (range: PlanRange) => range.done && range.graded && range.corrected;
export const planOf = (task: PlanningTask) => task.planning?.schemaVersion === 1 ? task.planning : emptyPlan();
export function progressOf(task: PlanningTask): number | null {
  if (task.status === "completed") return 100;
  const ranges = planOf(task).ranges;
  const total = ranges.reduce((n, r) => n + r.units, 0);
  return total > 0 ? 100 * ranges.reduce((n, r) => n + (rangeComplete(r) ? r.units : 0), 0) / total : null;
}
export function aggregate(tasks: PlanningTask[]) {
  // Unknown weights/progress are never substituted with a guessed percentage.
  const measured = tasks.map(t => ({ value: progressOf(t), weight: planOf(t).ranges.reduce((n, r) => n + r.minutes, 0) }));
  if (!measured.length || measured.some(m => m.value === null || m.weight <= 0)) return null;
  return measured.reduce((n, m) => n + m.value! * m.weight, 0) / measured.reduce((n, m) => n + m.weight, 0);
}
export function dailyWork(plan: TaskPlan): Record<string, number> {
  const total = plan.ranges.reduce((n, r) => n + r.units, 0);
  const days: Record<string, number> = {};
  for (const r of plan.ranges) if (r.day && total > 0) days[r.day] = (days[r.day] ?? 0) + r.units / total * 100;
  return days;
}
export function difference(progress: number | null, daily: Record<string, number> | null, today: string) {
  if (progress === null || !daily || !Object.keys(daily).length) return null;
  const expected = Object.entries(daily).reduce((n, [day, work]) => n + (day <= today ? work : 0), 0);
  return { expected, points: progress - expected };
}
export function estimate(task: PlanningTask, all: PlanningTask[], manualMinutes: number | null): Evidence {
  const units = planOf(task).ranges.reduce((n, r) => n + r.units, 0);
  const usable = (t: PlanningTask) => t.history.filter(h => h.reviewStatus !== "pending" && !h.operationCheck && (h.graded === true || (typeof h.score === "number" && Number.isFinite(h.score))) && h.duration > 0 && h.attemptType && h.units === units);
  const same = usable(task);
  const similar = all.filter(t => t.id !== task.id && t.subject === task.subject && t.category === task.category && t.materialName === task.materialName && t.materialName.trim()).flatMap(usable);
  const rows = same.length ? same : similar;
  const first = rows.filter(h => h.attemptType === "first"), redo = rows.filter(h => h.attemptType === "redo");
  const average = (items: typeof rows) => items.length ? Math.round(items.reduce((n, h) => n + h.duration, 0) / items.length) : null;
  const dateOf = (h: typeof rows[number]) => h.endAt ? getJstDay(h.endAt) : h.date && validDay(h.date) ? h.date : null;
  const groups = same.length ? [same] : all.filter(t=>t.id!==task.id && t.subject===task.subject && t.category===task.category && t.materialName===task.materialName).map(usable);
  const spans = groups.flatMap(group => {
    const initial = group.filter(h=>h.attemptType==='first').flatMap(h=>dateOf(h) ? [Date.parse(dateOf(h)!)] : []);
    const corrections = group.filter(h=>h.attemptType==='redo').flatMap(h=>dateOf(h) ? [Date.parse(dateOf(h)!)] : []);
    return initial.length && corrections.length ? [Math.max(0,(Math.max(...corrections)-Math.min(...initial))/86400000)] : [];
  });
  const redoDays = spans.length ? Math.ceil(spans.reduce((n, days)=>n+days,0)/spans.length) : 0;
  return { source: same.length ? "同一taskId" : similar.length ? "同教科・同教材名・同カテゴリ・同作業量" : "有効な採点済み履歴なし", count: rows.length, firstCount: first.length, redoCount: redo.length, firstSeconds: average(first), redoSeconds: redo.length ? redo.reduce((n, h) => n + h.duration, 0) / Math.max(1, first.length) : null, redoDays, redoDaysKnown: spans.length > 0, conditions: "初回と直しを分離。採点済み・同じ予定作業量・未終了/確認待ちは除外。0点も有効。教材間の比較は同教科/教材/カテゴリに限定。直し日数は課題ごとの最初の初回から最後の直しまでの暦日差を平均（切上げ）。", manualMinutes, provisional: !first.length || !redo.length || !units || !spans.length };

}
export function makeBaseline(task: PlanningTask, all: PlanningTask[], capacities: Record<string, number>, others: PlanningTask[], today: string, id: string, manualMinutes: number | null): Baseline {
  const evidence = estimate(task, all, manualMinutes);
  const estimated = manualMinutes ?? (evidence.firstSeconds === null ? null : Math.ceil((evidence.firstSeconds + (evidence.redoSeconds ?? 0)) / 60));
  evidence.estimatedMinutes = estimated;
  const daily: Record<string, number> = {};
  let remaining = estimated;
  let last: string | null = null;
  const redoMinutes = evidence.redoSeconds === null ? 0 : Math.min(estimated ?? 0, Math.max(1, Math.ceil(evidence.redoSeconds / 60)));
  const redoStart = addDays(today, Math.max(1, evidence.redoDays));
  for (let n = 0; remaining !== null && remaining > 0 && n < 366; n++) {
    const day = addDays(today, n);
    const booked = others.filter(t => t.id !== task.id).flatMap(t => planOf(t).ranges).filter(r => r.day === day).reduce((sum, r) => sum + r.minutes, 0);
    const available = Math.max(0, (capacities[day] ?? 0) - booked);
    const allowed = redoMinutes > 0 && day < redoStart ? Math.max(0, remaining - redoMinutes) : remaining;
    const used = Math.min(allowed, available);
    if (used > 0) { daily[day] = used / estimated! * 100; remaining -= used; last = day; }
  }
  return { id, createdDay: today, targetDay: remaining === 0 ? last : null, daily: remaining === 0 ? daily : {}, evidence };
}
export function validatePlan(plan: TaskPlan) {
  if(plan.questionMeasurement)validateQuestionMeasurement(plan.questionMeasurement);if(plan.questionPlan)validateQuestionPlan(plan.questionPlan);if(plan.questionGoal){validateQuestionPlan(plan.questionGoal.plan);const g=plan.questionGoal;if(!g.id||!Number.isSafeInteger(g.revision)||g.revision<1||!Number.isFinite(g.adoptedAt)||g.adoptedAt<=0||!g.reason.trim()||g.reason.length>200)throw Error('数量固定目標のrevision・採用理由を確認してください。');}
  if([plan.questionMeasurementHistory,plan.questionPlanHistory,plan.questionGoalHistory].some(h=>(h?.length??0)>50))throw Error("数量・目標履歴は50件までです。");
  if(plan.wbs)validateWbs(plan.wbs);
  if (plan.schemaVersion !== 1 || !Number.isSafeInteger(plan.revision) || plan.revision < 0 || plan.ranges.length > 100 || new Set(plan.ranges.map(r => r.id)).size !== plan.ranges.length || (plan.endDay && !validDay(plan.endDay)) || (plan.deadline && !validDay(plan.deadline))) throw new Error("計画の形式を確認してください。");
  if (plan.ranges.some(r => !r.id || !r.label.trim() || r.label.length > 150 || !(r.units > 0 && r.units <= 10000) || !(r.minutes > 0 && r.minutes <= 1440) || (r.day && !validDay(r.day)) || (r.actualDay !== null && !validDay(r.actualDay)) || (r.actualSeconds !== null && (!Number.isFinite(r.actualSeconds) || r.actualSeconds < 0)))) throw new Error("分割範囲・作業量・予定時間を確認してください。");
  if (plan.order !== undefined && (!Number.isInteger(plan.order) || plan.order < 0 || plan.order > 10000)) throw new Error("順番は0〜10000にしてください。");
  if ((plan.rangeCorrections?.length ?? 0) > 50) throw new Error("範囲の訂正履歴は50件までです。");
  if (plan.baselineHistory.length > 50) throw new Error("目標基準の履歴は50件までです。");
  if((plan.targetRevisions?.length??0)>50||plan.targetRevisions?.some(r=>!r.id||!Number.isSafeInteger(r.revision)||r.revision<1||!Number.isFinite(r.changedAt)||!r.reason.trim()||r.reason.length>100||r.memo.length>200||!validDay(r.newTargetDay)||(r.oldTargetDay!==null&&!validDay(r.oldTargetDay))))throw Error('目標変更の理由・日付・履歴を確認してください。');
}

export function normalizeCapacities(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([day, minutes]) => validDay(day) && Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440).slice(0, 366));
}

// Compare map contents rather than Firestore's property iteration order.
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);
export function correctRangeInputs(old: TaskPlan, revised: PlanRange[], reason: string, id: string, day: string): TaskPlan {
  if (!reason.trim() || reason.length > 200 || !id || !validDay(day)) throw new Error("訂正理由を200文字以内で入力してください。");
  if (revised.length !== old.ranges.length || revised.some((r,i)=>r.id!==old.ranges[i].id)) throw new Error("入力訂正では範囲IDと範囲の数を維持してください。");
  const ranges = old.ranges.map((r,i)=>({...r,label:revised[i].label,units:revised[i].units,minutes:revised[i].minutes}));
  if (canonical(ranges) === canonical(old.ranges)) throw new Error("訂正する範囲・作業量・予定時間を変更してください。");
  const result: TaskPlan = { ...old, ranges, baseline: null, baselineHistory: [...old.baselineHistory,...(old.baseline ? [old.baseline] : [])], rangeCorrections: [...old.rangeCorrections ?? [],{id,day,reason:reason.trim(),baselineId:old.baseline?.id ?? null,previousRanges:structuredClone(old.ranges),revisedRanges:structuredClone(ranges)}] };
  validatePlan(result);
  return result;
}
export function validatePlanTransition(old: TaskPlan, next: TaskPlan) {
  for(const [value,history] of [['questionMeasurement','questionMeasurementHistory'],['questionPlan','questionPlanHistory'],['questionGoal','questionGoalHistory']] as const){const expected=[...old[history]??[],...(old[value]&&canonical(old[value])!==canonical(next[value])?[old[value]]:[])];if(canonical(expected)!==canonical(next[history]??[])||old[value]&&!next[value])throw Error('数量・固定目標の変更履歴を維持してください。');}

  const previousTargets=old.targetRevisions??[],targets=next.targetRevisions??[];
  if(canonical(previousTargets)!==canonical(targets)){
    const change=targets.at(-1);
    if(targets.length!==previousTargets.length+1||canonical(targets.slice(0,-1))!==canonical(previousTargets)||!change||change.revision!==old.revision+1||next.baseline?.id!==change.id||next.baseline?.targetDay!==change.newTargetDay||(old.baseline&&canonical(change.previousBaseline)!==canonical(old.baseline)))throw Error('変更前の目標とrevision履歴を維持してください。');
  }
  const previousCorrections = old.rangeCorrections ?? [], corrections = next.rangeCorrections ?? [];
  if (canonical(previousCorrections) !== canonical(corrections)) {
    const c = corrections.at(-1);
    if (corrections.length !== previousCorrections.length + 1 || !c || canonical(corrections.slice(0,-1)) !== canonical(previousCorrections) || canonical(c.previousRanges) !== canonical(old.ranges) || canonical(c.revisedRanges) !== canonical(next.ranges)) throw new Error("訂正前の範囲と履歴を維持してください。");
    const expected = correctRangeInputs(old, next.ranges, c.reason, c.id, c.day);
    if (canonical(expected) !== canonical(next)) throw new Error("入力訂正では旧目標と実績を維持してください。");
    return;
  }
  const history = [...old.baselineHistory, ...(old.baseline && old.baseline.id !== next.baseline?.id ? [old.baseline] : [])];
  if (canonical(history) !== canonical(next.baselineHistory)) throw new Error("固定目標と改訂履歴を維持してください。");
  if (old.baseline) {
    const weights = (p: TaskPlan) => p.ranges.map(r=>[r.id,r.label,r.units,r.minutes]);
    if (canonical(weights(old)) !== canonical(weights(next))) throw new Error("固定目標作成後は明示的な入力訂正を使用してください。");
    if (!next.baseline || (old.baseline.id === next.baseline.id && canonical(old.baseline) !== canonical(next.baseline))) throw new Error("固定目標と改訂履歴を維持してください。");
  }
}
