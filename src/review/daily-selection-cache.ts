import { getJstDay, jstDayNumber, validId, type Progress, type Question } from "./model";
import { activeTargetPlan, dailyReviewSelection, type DailyExposure, type TargetPlan } from "./target-plan";

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function exposure(v: unknown): v is DailyExposure {
  return record(v) && typeof v.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.day) &&
    Number.isFinite(Date.parse(v.day)) && new Date(v.day).toISOString().slice(0, 10) === v.day &&
    (v.scope === undefined || typeof v.scope === "string") &&
    Array.isArray(v.ids) && v.ids.length <= 5 && v.ids.every(q => record(q) && validId(q.id) && validId(q.version)) &&
    new Set(v.ids.map(q => q.id)).size === v.ids.length;
}

// Separate from the existing additional-practice cache. Scoped by project/family/user.
// Persist IDs/versions and a scope signature, never question text or answers.
export function resolveDailySelection(raw: string | null, questions: Question[], progress: Progress[], plan: TargetPlan | null, now: number) {
  const day = getJstDay(now), today = jstDayNumber(now), active = activeTargetPlan(plan, now);
  const scope = JSON.stringify([active?.testDay ?? null, active?.items.map(i => [i.questionId, i.questionVersion, i.topicId]) ?? null, active?.integration?.source.reviewPolicy ?? null]);
  let entries: DailyExposure[] = [];
  try {
    const saved: unknown = raw && raw.length <= 200000 ? JSON.parse(raw) : null;
    if (record(saved) && saved.schemaVersion === 1 && Array.isArray(saved.entries)) entries = saved.entries.filter(exposure);
  } catch { /* Rebuild corrupt cache without touching answer/progress data. */ }
  entries = entries.filter(e => {
    const age = today - jstDayNumber(Date.parse(e.day));
    return age >= 0 && age <= 3;
  });
  const live = dailyReviewSelection(questions, progress, plan, now, entries);
  const saved = entries.find(e => e.day === day);
  const valid = saved && saved.scope === scope && (saved.ids.length > 0 || !live.selected.length) &&
    saved.ids.every(i => questions.some(q => q.id === i.id && q.version === i.version));
  // Answered / no-longer-due questions leave today's list without filling it with
  // replacements. The original five IDs remain in the exposure history.
  const selected = valid ? saved.ids.flatMap(i => live.eligible.filter(c => c.question.id === i.id && c.question.version === i.version)).slice(0, live.remaining) : live.selected;
  const ids = valid ? saved.ids : selected.map(c => ({ id: c.question.id, version: c.question.version }));
  const retained = [...new Map(entries.filter(e => e.day !== day).map(e => [e.day, e])).values()].map(e => ({ day: e.day, ids: e.ids }));
  return { ...live, selected, raw: JSON.stringify({ schemaVersion: 1, entries: [...retained, { day, ids, scope }] }) };
}
