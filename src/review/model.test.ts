import { describe, expect, it } from "vitest";
import { answerQuestion, createReviewDraft, visibleQuestions, getJstDay, nextProgress, parseQuestions, progressLabel, restoreDraft, sampleQuestions, selectQuestions, validateQuestion, validateWeakness, type Draft } from "./model";
const start = (count = 5): Draft => ({ id: "session", uid: "a", mode: "daily", questions: sampleQuestions.slice(0, count), startedAt: 1000, questionStartedAt: 1000, answers: [], finishedAt: null });
const complete = (correct: boolean) => { let d = start(); for (const q of d.questions) d = answerQuestion(d, correct ? q.correctIndex : (q.correctIndex + 1) % 4, d.questionStartedAt + 61000); return d; };
describe("short review sessions", () => {
  it("filters publication safely and starts a new session with one injected timestamp", () => {
    const questions = [sampleQuestions[0], { ...sampleQuestions[1], published: false }, { ...sampleQuestions[2], published: undefined }];
    expect(visibleQuestions(questions)).toEqual([questions[0]]);
    expect(visibleQuestions(questions, true)).toEqual([questions[0], questions[2]]);
    expect(createReviewDraft("child", [questions[0]], "daily", 5000)).toMatchObject({ uid: "child", startedAt: 5000, questionStartedAt: 5000, mode: "daily", answers: [], finishedAt: null });
  });
  it.each([true, false])("grades only after all five and supports zero/all correct: %s", correct => {
    const result = complete(correct);
    expect(result.answers.filter(a => a.correct)).toHaveLength(correct ? 5 : 0);
    expect(result.finishedAt! - result.startedAt).toBe(305000);
    expect(result.answers.every(a => a.elapsedMs === 61000 && a.explanation && a.expected)).toBe(true);
    expect(() => answerQuestion(result, 0, 999999)).toThrow();
  });
  it("does not time out at three minutes, accepts one question, rejects invalid selections", () => {
    const d = answerQuestion(start(1), 1, 900000);
    expect(d.finishedAt).toBe(900000); expect(d.answers[0].correct).toBe(true);
    for (const invalid of [-1, 4, NaN, 0.5]) expect(() => answerQuestion(start(), invalid, 2000)).toThrow();
  });
  it.each([1, 2, 3, 4])("uses exactly %s available questions without padding", count => {
    const questions = selectQuestions(sampleQuestions.slice(0, count), [], 0);
    expect(questions).toHaveLength(count); expect(new Set(questions.map(q => q.id)).size).toBe(count);
  });
  it("restores partially answered and scored drafts, rebuilding grades and isolating UID", () => {
    const d = answerQuestion(start(), 1, 2000);
    expect(restoreDraft(JSON.stringify(d), "a")).toEqual(d);
    expect(restoreDraft(JSON.stringify(complete(true)), "a")).toEqual(complete(true));
    expect(restoreDraft(JSON.stringify(d), "b")).toBeNull();
    expect(restoreDraft("{", "a")).toBeNull();
    expect(restoreDraft(JSON.stringify({ ...d, questions: [d.questions[0], d.questions[0]] }), "a")).toBeNull();
    const forged = structuredClone(d); forged.answers[0].correct = false;
    expect(restoreDraft(JSON.stringify(forged), "a")?.answers[0].correct).toBe(true);
  });
  it("prioritizes errors, lowers recent correct answers, shuffles ties and never duplicates", () => {
    const answers = complete(true).answers;
    const recent = nextProgress(undefined, answers[0]);
    const wrong = nextProgress(undefined, { ...answers[4], correct: false, answeredAt: 0 });
    expect(selectQuestions(sampleQuestions, [recent, wrong], 86400000, () => 0).map(q => q.id)).toEqual(["sample-4", "sample-1", "sample-2", "sample-3"]);
    expect(selectQuestions(sampleQuestions, [recent], recent.nextAt, () => 0)[0].id).toBe("sample-0");
    expect(selectQuestions([], [], 0)).toEqual([]);
    expect(selectQuestions(sampleQuestions.slice(0, 2), [], 0)).toHaveLength(2);
    expect(selectQuestions(sampleQuestions, [], 0, () => 0, ["sample-3"])[0].id).toBe("sample-3");
  });
  it("records improvement, distinguishes immediate retries and keeps later progress on late arrival", () => {
    const a = complete(false).answers[0], old = nextProgress(undefined, a);
    const retry = nextProgress(old, { ...a, id: "retry_0", mode: "retry", answeredAt: a.answeredAt + 1000, correct: true });
    expect(retry.count).toBe(2); expect(retry.firstCorrect).toBe(false); expect(retry.previousCorrect).toBe(false);
    expect(getJstDay(retry.nextAt)).toBe("1970-01-02"); expect(retry.reviewStage).toBe(0); expect(progressLabel(retry)).toContain("直後");
    const later = nextProgress(retry, { ...a, id: "later_0", answeredAt: retry.nextAt, correct: true });
    expect(later.nextAt - later.latestAt).toBe(259200000); expect(later.reviewStage).toBe(1);
    expect(nextProgress(later, a)).toMatchObject({ latestAt: later.latestAt, latestCorrect: true, count: 4, recordedAttemptId: a.id });
    expect(progressLabel(nextProgress(old, { ...a, correct: true }))).toContain("前回の誤答");
  });
  it.each([["2026-10-25T14:59:59Z", "2026-10-25"], ["2026-10-25T15:00:00Z", "2026-10-26"], ["2026-12-31T15:00:00Z", "2027-01-01"]])("uses JST: %s", (at, expected) => expect(getJstDay(Date.parse(at))).toBe(expected));
  it("rejects malformed imports atomically, unknown fields, duplicates and invalid answer data", () => {
    const { id: _id, version: _version, ...row } = sampleQuestions[0]; void _id; void _version;
    expect(parseQuestions(JSON.stringify([row]))[0]).toMatchObject(row);
    expect(parseQuestions(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ ...row, prompt: `確認問題${i}`, published: false }))))).toHaveLength(50);
    for (const input of ["null", "{}", "[]", "{", JSON.stringify([row, row]), JSON.stringify([{ ...row, uid: "a" }]), JSON.stringify([{ ...row, choices: ["x", "x", "y", "z"] }]), JSON.stringify([{ ...row, correctIndex: 4 }]), JSON.stringify([{ ...row, subject: "unknown" }]), JSON.stringify(Array(51).fill(row)), " ".repeat(200001)]) expect(() => parseQuestions(input)).toThrow();
    for (const q of [{ ...sampleQuestions[0], prompt: " " }, { ...sampleQuestions[0], source: "x".repeat(301) }, { ...sampleQuestions[0], id: "../bad" }]) expect(() => validateQuestion(q)).toThrow();
  });
  it("validates parent observations without inferring weaknesses from test scores", () => {
    const w = { id: "weakness", subject: "math", unit: "確認中", mistake: "保護者入力", point: "もう一度確認", testKind: "カリテ", questionIds: ["q1"] };
    expect(() => validateWeakness(w)).not.toThrow();
    for (const bad of [{ ...w, unit: "" }, { ...w, questionIds: Array(6).fill("q") }, { ...w, questionIds: ["../q"] }, { ...w, score: 50 }]) expect(() => validateWeakness(bad)).toThrow();
  });
});
