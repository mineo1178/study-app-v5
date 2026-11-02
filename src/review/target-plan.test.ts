import { describe, expect, it } from "vitest";
import { getJstDay, jstDayNumber, nextProgress, reviewDueAt, sampleQuestions, selectQuestions, type Answer, type Progress } from "./model";
import { parseTargetPlan, targetCandidates, type TargetPlan } from "./target-plan";
const at = (s: string) => Date.parse(`${s}T12:00:00+09:00`);
const answer = (day: string, correct = true, mode: Answer["mode"] = "daily", id = day): Answer => ({ id, uid: "a", sessionId: id, questionId: sampleQuestions[0].id, questionVersion: sampleQuestions[0].version, selectedIndex: 1, correct, answeredAt: at(day), elapsedMs: 1000, mode, prompt: "fictional", selected: "42", expected: "42", explanation: "fictional" });
const plan: TargetPlan = { schemaVersion: 1, label: "架空テスト", testDay: "2027-02-01", items: sampleQuestions.slice(0, 2).map((q, i) => ({ questionId: q.id, questionVersion: q.version, priority: i + 1, reason: "架空の誤答を再確認しよう", evidence: "架空答案の観察", scopeBasis: "架空の範囲資料" })), gaps: ["記述は未確認"], notes: ["実資料ではない"] };
describe("JST spaced review and evidence-based selection", () => {
  it("wrong tomorrow, due-day correct after 3, 7 and 14 days, then stays at 14", () => {
    let p = nextProgress(undefined, answer("2026-11-02", false));
    expect([p.reviewStage, getJstDay(p.nextAt)]).toEqual([0, "2026-11-03"]);
    for (const [day, due, stage] of [["2026-11-03", "2026-11-06", 1], ["2026-11-06", "2026-11-13", 2], ["2026-11-13", "2026-11-27", 3], ["2026-11-27", "2026-12-11", 3]] as const) {
      p = nextProgress(p, answer(day)); expect([p.reviewStage, getJstDay(p.nextAt)]).toEqual([stage, due]);
    }
    p = nextProgress(p, answer("2026-12-11", false)); expect([p.reviewStage, getJstDay(p.nextAt)]).toEqual([0, "2026-12-12"]);
  });
  it("same-day correct, manual early correct and immediate retry cannot advance or delay the due date", () => {
    expect(nextProgress(undefined, answer("2026-11-02", true, "retry")).reviewStage).toBe(0);
    let p = nextProgress(undefined, answer("2026-11-02", false)); const due = p.nextAt;
    for (const mode of ["retry", "daily", "retry"] as const) { p = nextProgress(p, answer("2026-11-02", true, mode)); expect([p.reviewStage, p.nextAt]).toEqual([0, due]); }
    p = nextProgress(p, answer("2026-11-03")); const stage = p.reviewStage, nextAt = p.nextAt;
    p = nextProgress(p, answer("2026-11-04")); expect([p.reviewStage, p.nextAt]).toEqual([stage, nextAt]);
  });
  it("JST midnight, leap day, year boundary and missed due days", () => {
    expect(getJstDay(nextProgress(undefined, { ...answer("2026-12-31", false), answeredAt: Date.parse("2026-12-31T14:59:59Z") }).nextAt)).toBe("2027-01-01");
    expect(getJstDay(nextProgress(undefined, answer("2028-02-28", false)).nextAt)).toBe("2028-02-29");
    const p = nextProgress(undefined, answer("2026-11-02", false));
    expect(selectQuestions([sampleQuestions[0]], [p], p.nextAt - 1)).toEqual([]);
    expect(selectQuestions([sampleQuestions[0]], [p], p.nextAt)).toHaveLength(1);
    expect(getJstDay(nextProgress(p, answer("2026-11-20")).nextAt)).toBe("2026-11-23");
  });
  it("legacy progress is conservatively upgraded, answers unchanged and new versions restart", () => {
    const { reviewStage: _s, reviewDay: _d, ...legacy } = nextProgress(undefined, answer("2026-11-02", false)); void _s; void _d;
    legacy.nextAt = legacy.latestAt;
    expect(getJstDay(reviewDueAt(legacy))).toBe("2026-11-03");
    const upgraded = nextProgress(legacy, answer("2026-11-03")); expect(upgraded).toMatchObject({ count: 2, firstCorrect: false, reviewStage: 1 });
    const older = nextProgress(upgraded, answer("2026-11-01", false)); expect(older).toMatchObject({ count: 3, reviewStage: 1, nextAt: upgraded.nextAt, latestAt: upgraded.latestAt });
    const changed = nextProgress(upgraded, { ...answer("2026-11-07"), questionVersion: "v2" }); expect(changed.reviewStage).toBe(1);
  });
  it("only matched versions, due reviews before new questions, relevance tie break and maximum five", () => {
    const p = nextProgress(undefined, { ...answer("2026-11-02", false), questionId: sampleQuestions[1].id });
    expect(targetCandidates(sampleQuestions, [p], plan, at("2026-11-03")).map(c => c.question.id)).toEqual(["sample-1", "sample-0"]);
    expect(targetCandidates(sampleQuestions, [p], plan, at("2026-11-02"))).toHaveLength(1);
    expect(targetCandidates(sampleQuestions.map(q => ({ ...q, version: "edited" })), [], plan, at("2026-11-02"))).toEqual([]);
    expect(targetCandidates(sampleQuestions, [], plan, at("2027-02-02"))).toEqual([]);
    expect(targetCandidates(Array.from({ length: 9 }, (_, i) => ({ ...sampleQuestions[0], id: "q" + i })), [], null, at("2026-11-02"))).toHaveLength(5);
    expect(targetCandidates(sampleQuestions, [], plan, at("2026-11-02"))[0].reason).toContain("架空");
  });
  it("does not pad all-not-due pools; restored progress keeps the same plan", () => {
    const ps: Progress[] = sampleQuestions.map(q => nextProgress(undefined, { ...answer("2026-11-02"), questionId: q.id }));
    expect(selectQuestions(sampleQuestions, ps, at("2026-11-03"))).toEqual([]);
    expect(targetCandidates(sampleQuestions, JSON.parse(JSON.stringify(ps)), plan, at("2026-11-03"))).toEqual([]);
    expect(jstDayNumber(ps[0].nextAt) - ps[0].reviewDay!).toBe(3);
    const pool = Array.from({ length: 10 }, (_, i) => ({ ...sampleQuestions[0], id: "day-cap-" + i }));
    const done = pool.slice(0, 4).map(q => nextProgress(undefined, { ...answer("2026-11-02"), questionId: q.id }));
    expect(targetCandidates(pool, done, null, at("2026-11-02"))).toHaveLength(1);
    done.push(nextProgress(undefined, { ...answer("2026-11-02"), questionId: pool[4].id }));
    expect(targetCandidates(pool, done, null, at("2026-11-02"))).toEqual([]);
  });
  it("validates import boundaries, evidence, date, duplicates, and strips extra fields", () => {
    expect(parseTargetPlan(JSON.stringify({ ...plan, privateExtra: "not retained" }))).toEqual(plan);
    for (const bad of [null, { ...plan, testDay: "2026-02-30" }, { ...plan, items: [{ ...plan.items[0], evidence: "" }] }, { ...plan, items: [plan.items[0], plan.items[0]] }, { ...plan, gaps: [123] }, { ...plan, items: [{ ...plan.items[0], priority: 0 }] }]) expect(() => parseTargetPlan(JSON.stringify(bad))).toThrow();
  });
});
