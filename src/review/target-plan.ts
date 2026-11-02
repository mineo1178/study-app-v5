import { getJstDay, reviewDueAt, validId, type Progress, type Question } from "./model";

// Personal observations are imported on the device; never bundled with the app or sent to Firestore.
export type TargetPlan = { schemaVersion: 1; label: string; testDay: string; items: { questionId: string; questionVersion: string; priority: number; reason: string; evidence: string; scopeBasis: string }[]; gaps: string[]; notes: string[] };
const text = (v: unknown, max = 500): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
export function parseTargetPlan(raw: string): TargetPlan {
  if (raw.length > 50000) throw new Error("対策計画が大きすぎます。");
  const p = JSON.parse(raw) as TargetPlan;
  if (!p || p.schemaVersion !== 1 || !text(p.label, 100) || !/^\d{4}-\d{2}-\d{2}$/.test(p.testDay) ||
    Number.isNaN(Date.parse(p.testDay)) || new Date(p.testDay).toISOString().slice(0, 10) !== p.testDay ||
    !Array.isArray(p.items) || p.items.length > 200 || !Array.isArray(p.gaps) || p.gaps.length > 30 || p.gaps.some(v => !text(v)) ||
    !Array.isArray(p.notes) || p.notes.length > 20 || p.notes.some(v => !text(v)) ||
    p.items.some(i => !i || !validId(i.questionId) || !validId(i.questionVersion) || ![1, 2, 3].includes(i.priority) || !text(i.reason) || !text(i.evidence) || !text(i.scopeBasis)) ||
    new Set(p.items.map(i => i.questionId)).size !== p.items.length) throw new Error("根拠・対象問題・テスト日を含む対策計画を選んでください。");
  // Discard unknown properties (including accidental extra personal fields).
  return { schemaVersion: 1, label: p.label, testDay: p.testDay,
    items: p.items.map(i => ({ questionId: i.questionId, questionVersion: i.questionVersion, priority: i.priority, reason: i.reason, evidence: i.evidence, scopeBasis: i.scopeBasis })), gaps: p.gaps, notes: p.notes };
}
export function targetCandidates(questions: Question[], progress: Progress[], plan: TargetPlan | null, now: number) {
  if (plan && getJstDay(now) > plan.testDay) return [];
  const today = getJstDay(now);
  const remaining = Math.max(0, 5 - new Set(progress.filter(p => getJstDay(p.latestAt) === today).map(p => p.questionId)).size);
  return questions.flatMap(q => {
    const item = plan?.items.find(i => i.questionId === q.id && i.questionVersion === q.version);
    if (plan && !item) return [];
    const p = progress.find(p => p.questionId === q.id && p.questionVersion === q.version);
    if (p && reviewDueAt(p) > now) return [];
    const reason = item?.reason ?? "登録されている問題を、日を空けて確かめよう。テスト範囲との関係は未確認です。";
    return [{ question: q, reason, dueAt: p ? reviewDueAt(p) : null, priority: item?.priority ?? 3 }];
  }).sort((a, b) => (a.dueAt === null ? 1 : 0) - (b.dueAt === null ? 1 : 0) ||
    (a.dueAt ?? 0) - (b.dueAt ?? 0) || a.priority - b.priority || a.question.id.localeCompare(b.question.id)).slice(0, remaining);
}
