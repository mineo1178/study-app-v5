export type TimedEvidence = { taskId?: string; taskLabel?: string; elapsedSeconds: number; score: number; maxScore: number; attemptType: "first" | "redo"; finishedAt: number; startedAt: number; practice?: boolean; operationCheck?: boolean };
export function targetAverage(rows: TimedEvidence[], taskId: string, taskLabel: string, mode: "first" | "redo") {
  const valid = rows.filter(r => r.attemptType === mode && !r.practice && !r.operationCheck && Number.isInteger(r.score) && r.score >= 0 && r.score <= r.maxScore && r.elapsedSeconds > 0 && r.finishedAt >= r.startedAt && r.elapsedSeconds <= 14400 && r.maxScore === 7);
  const same = valid.filter(r => r.taskId === taskId);
  // Exact condition: task label includes unit/material and range, never match by title alone.
  const similar = valid.filter(r => r.taskLabel === taskLabel && taskLabel.trim() && r.taskId !== taskId);
  const matches = same.length ? same : similar;
  return { seconds: matches.length ? Math.max(1, Math.round(matches.reduce((sum, r) => sum + r.elapsedSeconds, 0) / matches.length)) : 300, count: matches.length, provisional: !matches.length, source: same.length ? "同一taskId・7問・同じ実施モード" : similar.length ? "同じ回・教材・範囲のラベル・7問・同じ実施モード" : "履歴不足" };
}
export type StudyTargetRow = { duration: number; reviewStatus?: string; graded?: boolean; attemptType?: "first" | "redo"; units?: number; operationCheck?: boolean };
export function studyTargetAverage(rows: StudyTargetRow[], mode: "first" | "redo", units: number, related: StudyTargetRow[] = []) {
  const usable = (items: StudyTargetRow[]) => items.filter(r => r.graded === true && !r.operationCheck && r.reviewStatus !== "pending" && r.attemptType === mode && units > 0 && r.units === units && r.duration > 0 && r.duration <= 14400);
  const same = usable(rows), valid = same.length ? same : usable(related);
  return { seconds: valid.length ? Math.max(1, Math.round(valid.reduce((n, r) => n + r.duration, 0) / valid.length)) : 300, count: valid.length, provisional: !valid.length };
}
import type { CalculationAttempt } from "../daily-calculation";
export function calculationEvidence(rows: CalculationAttempt[]): TimedEvidence[] {
  const seen=new Set<string>();
  return [...rows].sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||a.attemptNo-b.attemptNo).map(row=>{
    const key=JSON.stringify([row.dateKey,row.taskId??row.taskLabel]);
    const attemptType=seen.has(key)?"redo" as const:"first" as const;seen.add(key);
    return {...row,attemptType};
  });
}
