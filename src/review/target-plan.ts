import { getJstDay, jstDayNumber, reviewDueAt, validId, type Answer, type Progress, type Question } from "./model";
import type { Integration } from "./exchange-plan";

// Personal observations are imported on the device; never bundled with the app or sent to Firestore.
export type TargetPlan = { schemaVersion: 1; label: string; testDay: string; items: { questionId: string; questionVersion: string; priority: number; reason: string; evidence: string; scopeBasis: string; topicId?: string; classification?: string }[]; gaps: string[]; notes: string[]; integration?: Integration };
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
export function activeTargetPlan(plan: TargetPlan | null, now: number): TargetPlan | null {
  return plan && getJstDay(now) <= plan.testDay ? plan : null;
}
export type RegisteredTest = { name: string; date: string; type: string };

export function nextReviewTarget(tests: RegisteredTest[], plan: TargetPlan | null, now: number) {
  const today = getJstDay(now);
  const current = activeTargetPlan(plan, now);
  const exam = current?.integration?.source.targetExam;
  const normalizeName = (name: string) => name.normalize("NFKC").replace(/\s+/g, "");
  const names = [current?.label, exam?.officialName, ...exam?.aliases ?? []].flatMap(name => name ? [normalizeName(name)] : []);
  const upcoming = tests.flatMap(test => {
    if (test.type !== "curriculum") return [];
    const parts = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(test.date);
    if (!parts) return [];
    const day = `${parts[1]}-${parts[2].padStart(2, "0")}-${parts[3].padStart(2, "0")}`;
    const at = Date.parse(day);
    return day >= today && Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === day
      ? [{ label: test.name, testDay: day }] : [];
  }).sort((a, b) => a.testDay.localeCompare(b.testDay) || a.label.localeCompare(b.label));
  const matching = upcoming.find(test => test.testDay === upcoming[0].testDay &&
    test.testDay === current?.testDay && names.includes(normalizeName(test.label)));
  const activePlan = !upcoming.length || matching ? current : null;
  return {
    target: matching ?? upcoming[0] ?? (current ? { label: current.label, testDay: current.testDay } : null),
    hasRegisteredTarget: upcoming.length > 0,
    activePlan,
    status: activePlan ? "設定済み" : current ? "日程不一致" : plan ? "期限切れ" : "未設定",
  };
}

export function dailyReviewSelection(questions: Question[], progress: Progress[], plan: TargetPlan | null, now: number) {
  plan = activeTargetPlan(plan, now);
  const today = getJstDay(now);
  const answeredToday = progress.filter(p => getJstDay(p.latestAt) === today);
  const answeredIds = new Set(answeredToday.map(p => p.questionId));
  const remaining = Math.max(0, 5 - answeredIds.size);
  const inScope = questions.flatMap(q => {
    const item = plan?.items.find(i => i.questionId === q.id && i.questionVersion === q.version);
    if (plan && !item) return [];
    return [{ q, item }];
  });
  let notDueCount = 0, answeredInScope = 0;
  const pool = inScope.flatMap(({ q, item }) => {
    if (answeredIds.has(q.id)) { answeredInScope++; return []; }
    const p = progress.find(p => p.questionId === q.id && p.questionVersion === q.version);
    const dueAt = p ? reviewDueAt(p) : null;
    if (dueAt !== null && dueAt > now) { notDueCount++; return []; }
    const reason = item?.reason ?? "登録されている問題を、日を空けて確かめよう。テスト範囲との関係は未確認です。";
    const wrong = !!p && (!p.firstCorrect || !p.latestCorrect || !p.previousCorrect);
    return [{ question: q, reason, dueAt, wrong, topicId: item?.topicId ?? q.id }];
  });
  const comparePriority = (a: typeof pool[number], b: typeof pool[number]) =>
    Number(a.dueAt === null) - Number(b.dueAt === null) || Number(b.wrong) - Number(a.wrong);
  pool.sort((a, b) => comparePriority(a, b) || a.question.id.localeCompare(b.question.id));
  // Rotate every priority group, including overdue reviews, at JST midnight.
  for (let start = 0; start < pool.length;) {
    let end = start + 1;
    while (end < pool.length && comparePriority(pool[start], pool[end]) === 0) end++;
    const size = end - start;
    const offset = ((jstDayNumber(now) % size) + size) % size;
    const group = pool.slice(start, end);
    pool.splice(start, size, ...group.slice(offset), ...group.slice(0, offset));
    start = end;
  }
  const policy = plan?.integration?.source.reviewPolicy;
  const selected: typeof pool = [], topicCounts = new Map<string, number>();
  if (policy) for (const p of answeredToday) {
    const topic = plan?.items.find(i => i.questionId === p.questionId)?.topicId;
    if (topic) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }
  while (selected.length < remaining) {
    const eligible = pool.filter(c => !selected.includes(c) && (topicCounts.get(c.topicId) ?? 0) < (policy?.maxQuestionsPerTopicPerDay ?? 5));
    if (!eligible.length) break;
    const subjects = new Set(selected.map(c => c.question.subject));
    const minimum = Math.min(policy?.minimumSubjectsWhenEnoughEligibleQuestions ?? 1, new Set([...selected, ...eligible].map(c => c.question.subject)).size);
    const candidate = remaining - selected.length <= minimum - subjects.size
      ? eligible.find(c => comparePriority(c, eligible[0]) === 0 && !subjects.has(c.question.subject)) ?? eligible[0]
      : eligible[0];
    selected.push(candidate); topicCounts.set(candidate.topicId, (topicCounts.get(candidate.topicId) ?? 0) + 1);
  }
  return {
    selected, eligibleCount: pool.length, scopeCount: inScope.length, remaining, notDueCount, answeredInScope,
    answeredCount: answeredIds.size, newCount: pool.filter(c => c.dueAt === null).length,
    topicLimited: selected.length < Math.min(remaining, pool.length),
  };
}

export function targetCandidates(questions: Question[], progress: Progress[], plan: TargetPlan | null, now: number) {
  return dailyReviewSelection(questions, progress, plan, now).selected;
}

// Today's answers never affect ranking. The caller also snapshots IDs for the day.
export function practiceSelection(questions: Question[], history: Answer[], plan: TargetPlan | null, now: number) {
  const prior = history.filter(a => getJstDay(a.answeredAt) < getJstDay(now));
  const active = activeTargetPlan(plan, now);
  const rank = (q: Question) => {
    const item = active?.items.find(i => i.questionId === q.id && i.questionVersion === q.version);
    const answers = prior.filter(a => a.questionId === q.id && a.questionVersion === q.version);
    return [item ? 0 : 1, answers.length ? 1 : 0, answers.some(a => !a.correct) ? 0 : 1, answers.length];
  };
  const sorted = [...questions].sort((a, b) => {
    const ar = rank(a), br = rank(b);
    return ar.reduce((diff, value, i) => diff || value - br[i], 0) || a.id.localeCompare(b.id);
  });
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && rank(sorted[start]).join() === rank(sorted[end]).join()) end++;
    const group = sorted.slice(start, end), offset = jstDayNumber(now) % group.length;
    sorted.splice(start, group.length, ...group.slice(offset), ...group.slice(0, offset));
    start = end;
  }
  return sorted.slice(0, 5);
}
