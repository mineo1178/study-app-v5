import { describe, expect, it } from "vitest";
import { answerQuestion, createReviewDraft, getJstDay, nextProgress, sampleQuestions, type Progress, type Question } from "./model";
import { resolveDailySelection } from "./daily-selection-cache";
import { dailyReviewSelection, type DailyExposure, type TargetPlan } from "./target-plan";

const at = Date.parse("2026-11-11T12:00:00+09:00"), dayMs = 86400000;
const pool = (n: number) => Array.from({ length: n }, (_, i) => ({ ...sampleQuestions[0], id: `q-${String(i).padStart(2, "0")}` }));
const questionsOf = (result: ReturnType<typeof resolveDailySelection>) => result.selected.map(c => c.question);
const ids = (qs: Question[]) => qs.map(q => q.id);
const overlap = (a: Question[], b: Question[]) => a.filter(q => b.some(p => p.id === q.id)).length;
const planFor = (qs: Question[]): TargetPlan => ({ schemaVersion: 1, label: "fixture", testDay: "2026-12-01", items: qs.map(q => ({ questionId: q.id, questionVersion: q.version, priority: 1, reason: "fixture", evidence: "fixture", scopeBasis: "fixture" })), gaps: [], notes: [] });
function progressFor(q: Question, correct: boolean, when: number): Progress {
  return nextProgress(undefined, answerQuestion(createReviewDraft("fixture", [q], "daily", when), correct ? q.correctIndex : (q.correctIndex + 1) % 4, when).answers[0]);
}
const exposure = (qs: Question[], age: number): DailyExposure => ({ day: getJstDay(at - age * dayMs), ids: qs.map(q => ({ id: q.id, version: q.version })) });

describe("today's review exposure selection (formerly 今日の5問)", () => {
  it("preserves the pre-release selection on first use and improves adjacent overlap from four to zero", () => {
    const questions = pool(20);
    const previous = dailyReviewSelection(questions, [], null, at).selected.map(c => c.question);
    const nextWithoutExposures = dailyReviewSelection(questions, [], null, at + dayMs).selected.map(c => c.question);
    expect(overlap(previous, nextWithoutExposures)).toBe(4);
    const first = resolveDailySelection(null, questions, [], null, at);
    expect(questionsOf(first)).toEqual(previous);
    expect(overlap(previous, questionsOf(resolveDailySelection(first.raw, questions, [], null, at + dayMs)))).toBe(0);
  });
  it.each([20, 10, 5, 3, 0])("selects unique eligible IDs for %i questions across three days", n => {
    const questions = pool(n);
    let raw: string | null = null;
    const days: Question[][] = [];
    for (let day = 0; day < 3; day++) {
      const next = resolveDailySelection(raw, questions, [], null, at + day * dayMs);
      expect(next.selected).toHaveLength(Math.min(5, n));
      expect(new Set(ids(questionsOf(next))).size).toBe(next.selected.length);
      expect(questionsOf(resolveDailySelection(next.raw, questions, [], null, at + day * dayMs + 1000))).toEqual(questionsOf(next));
      days.push(questionsOf(next)); raw = next.raw;
    }
    for (let i = 1; i < days.length; i++) expect(overlap(days[i - 1], days[i])).toBe(n > 5 ? 0 : n);
    console.log(`pool=${n}: adjacent overlap=${overlap(days[0], days[1])},${overlap(days[1], days[2])}`);
  });
  it("uses three prior calendar days, ignores old/future days and never mutates inputs", () => {
    const questions = pool(20), entries = [exposure(questions.slice(0, 5), 1), exposure(questions.slice(5, 10), 2), exposure(questions.slice(10, 15), 3)];
    const before = structuredClone(entries);
    expect(new Set(dailyReviewSelection(questions, [], null, at, entries).selected.map(c => c.question.id))).toEqual(new Set(ids(questions.slice(15))));
    expect(entries).toEqual(before);
    expect(dailyReviewSelection(questions, [], null, at, [exposure(questions.slice(0, 5), 4), exposure(questions.slice(5, 10), -1)])).toEqual(dailyReviewSelection(questions, [], null, at));
  });
  it.each([2, 5, 8])("keeps the exact test scope for %i target questions, allowing necessary repetition", count => {
    const questions = pool(20), plan = planFor(questions.slice(0, count));
    const first = resolveDailySelection(null, questions, [], plan, at);
    const second = resolveDailySelection(first.raw, questions, [], plan, at + dayMs);
    expect(second.selected).toHaveLength(Math.min(count, 5));
    expect(second.selected.every(c => plan.items.some(i => i.questionId === c.question.id))).toBe(true);
    expect(overlap(questionsOf(first), questionsOf(second))).toBe(count <= 5 ? count : 2);
  });
  it("keeps repeatedly wrong due reviews, even when yesterday's entire set is important", () => {
    const questions = pool(20), important = questions.slice(0, 5);
    const progress = important.map(q => ({ ...progressFor(q, false, at - dayMs), count: 2, previousCorrect: false }));
    const before = structuredClone(progress);
    expect(new Set(dailyReviewSelection(questions, progress, null, at, [exposure(important, 1)]).selected.map(c => c.question.id))).toEqual(new Set(ids(important)));
    expect(progress).toEqual(before);
  });
  it("rotates a large due wrong pool without weakening review priority", () => {
    const questions = pool(25), progress = questions.slice(0, 20).map(q => progressFor(q, false, at - 4 * dayMs));
    let raw: string | null = null;
    const seen = new Set<string>();
    let previous: Question[] = [];
    for (let d = 0; d < 4; d++) {
      const next = resolveDailySelection(raw, questions, progress, null, at + d * dayMs);
      expect(next.selected.every(c => c.wrong && c.dueAt !== null)).toBe(true);
      expect(overlap(previous, questionsOf(next))).toBe(0);
      ids(questionsOf(next)).forEach(id => seen.add(id)); raw = next.raw; previous = questionsOf(next);
    }
    expect(seen.size).toBe(20);
  });
  it("never pads with not-due or out-of-scope questions", () => {
    const questions = pool(20), progress = questions.map(q => progressFor(q, true, at - dayMs));
    expect(resolveDailySelection(null, questions, progress, null, at).selected).toHaveLength(0);
    const target = planFor(questions.slice(0, 3));
    expect(resolveDailySelection(null, questions, progress, target, at).selected).toHaveLength(0);
  });
  it("keeps today's list stable on unrelated progress updates and pool additions", () => {
    const questions = pool(20), first = resolveDailySelection(null, questions, [], null, at);
    const other = questions.find(q => !ids(questionsOf(first)).includes(q.id))!;
    const next = resolveDailySelection(first.raw, [...questions, { ...questions[0], id: "extra" }], [progressFor(other, false, at - dayMs)], null, at);
    expect(questionsOf(next)).toEqual(questionsOf(first));
  });
  it("removes today's answered questions without substitutions and keeps the original exposure IDs", () => {
    const questions = pool(20), first = resolveDailySelection(null, questions, [], null, at);
    const chosen = questionsOf(first), progress = [progressFor(chosen[0], true, at)];
    const second = resolveDailySelection(first.raw, questions, progress, null, at);
    expect(questionsOf(second)).toEqual(chosen.slice(1));
    expect(JSON.parse(second.raw).entries[0].ids.map((q: { id: string }) => q.id)).toEqual(ids(chosen));
    const completed = resolveDailySelection(second.raw, questions, chosen.map(q => progressFor(q, false, at)), null, at);
    expect(completed.selected).toHaveLength(0); expect(completed.remaining).toBe(0);
  });
  it("reselects safely after deletion, version or target-scope changes", () => {
    const questions = pool(20), first = resolveDailySelection(null, questions, [], null, at), chosen = questionsOf(first);
    const deleted = questions.filter(q => q.id !== chosen[0].id);
    expect(questionsOf(resolveDailySelection(first.raw, deleted, [], null, at)).every(q => deleted.includes(q))).toBe(true);
    const revised = questions.map(q => q.id === chosen[0].id ? { ...q, version: "new-version" } : q);
    expect(questionsOf(resolveDailySelection(first.raw, revised, [], null, at)).every(q => revised.includes(q))).toBe(true);
    const plan = planFor(questions.filter(q => !ids(chosen).includes(q.id)).slice(0, 2));
    expect(resolveDailySelection(first.raw, questions, [], plan, at).selected).toHaveLength(2);
  });
  it.each(["{", "null", "[]", '{"schemaVersion":1,"entries":[null,{}, {"day":"2026-11-11","ids":[null]}]}']) ("recovers corrupt cache: %s", raw => {
    expect(resolveDailySelection(raw, pool(20), [], null, at).selected).toHaveLength(5);
  });
  it("prunes to four calendar dates and persists no question text or answers", () => {
    let raw: string | null = null;
    for (let d = 0; d < 9; d++) raw = resolveDailySelection(raw, pool(20), [], null, at + d * dayMs).raw;
    expect(JSON.parse(raw!).entries.map((e: DailyExposure) => e.day)).toEqual([5, 6, 7, 8].map(d => getJstDay(at + d * dayMs)));
    expect(raw).not.toContain(sampleQuestions[0].prompt); expect(raw).not.toContain("correctIndex");
  });
  it("changes at JST midnight over New Year", () => {
    const before = Date.parse("2026-12-31T14:59:59.999Z"), after = before + 1;
    const first = resolveDailySelection(null, pool(20), [], null, before), second = resolveDailySelection(first.raw, pool(20), [], null, after);
    expect(getJstDay(before)).toBe("2026-12-31"); expect(getJstDay(after)).toBe("2027-01-01");
    expect(overlap(questionsOf(first), questionsOf(second))).toBe(0);
  });
  it("matches exact question snapshots, answer IDs and grading", () => {
    const result = resolveDailySelection(null, pool(20), [], null, at), chosen = questionsOf(result);
    let draft = createReviewDraft("fixture", chosen, "daily", at);
    for (const q of chosen) draft = answerQuestion(draft, q.correctIndex, at);
    expect(draft.questions).toEqual(chosen); expect(draft.answers.map(a => a.questionId)).toEqual(ids(chosen));
    expect(draft.answers.every(a => a.correct && a.mode === "daily")).toBe(true);
    expect(() => answerQuestion(draft, 0, at)).toThrow();
  });
  it("keeps selection deterministic with duplicate IDs or reordered input", () => {
    const questions = pool(20);
    expect(dailyReviewSelection([...questions, questions[0]], [], null, at).selected).toEqual(dailyReviewSelection([...questions].reverse(), [], null, at).selected);
  });
});
