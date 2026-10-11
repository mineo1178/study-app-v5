import { describe, expect, it } from "vitest";
import { calculationStartLabel, calculationTaskRecords, isCalculationTask } from "./daily-calculation-view";
import { getJstDateKey, validateCalculationDraft, type CalculationAttempt } from "./daily-calculation";

const attempt = (attemptNo: number, taskId?: string, score = 3, elapsedSeconds = 260, startedAt = Date.parse("2026-10-10T10:00:00+09:00")): CalculationAttempt => ({
  id: `attempt-${startedAt}-${attemptNo}`, dateKey: getJstDateKey(startedAt), attemptNo, score, elapsedSeconds,
  startedAt, finishedAt: startedAt + 300000, createdAt: startedAt + 400000, maxScore: 7,
  attemptType: attemptNo === 1 ? "first" : "redo", ...(taskId ? { taskId, taskLabel: `第1回 / 計算${taskId}` } : {}),
});

describe("calculation task integration", () => {
  it("routes only the math calculation category, without interpreting card titles as question numbers", () => {
    for (const title of ["①", "⑦", "追加計算"]) expect(isCalculationTask({ subject: "math", category: "計算", ...{ title } })).toBe(true);
    expect(isCalculationTask({ subject: "math", category: "プリント" })).toBe(false);
    expect(isCalculationTask({ subject: "science", category: "計算" })).toBe(false);
  });
  it("keeps independent first scores/times for two interleaved tasks on one day", () => {
    const records = calculationTaskRecords([attempt(1, "①", 3, 260), attempt(2, "②", 2, 300), attempt(3, "①", 7, 135), attempt(4, "②", 6, 165)]);
    expect(records.map(r => [r.taskId, r.firstScore, r.firstElapsedSeconds, r.latestScore, r.latestElapsedSeconds, r.bestScore, r.attemptCount])).toEqual([
      ["①", 3, 260, 7, 135, 7, 2], ["②", 2, 300, 6, 165, 6, 2],
    ]);
    expect(records.map(r => r.history.map(h => [h.attemptNo, h.trialNo, h.label]))).toEqual([
      [[1, 1, "初回"], [3, 2, "解き直し1回目"]], [[2, 1, "初回"], [4, 2, "解き直し1回目"]],
    ]);
  });
  it("keeps 12 redos and permits a further challenge after 7/7 with identical graph/list values", () => {
    const saved = Array.from({ length: 13 }, (_, index) => attempt(index + 1, "①", index === 10 ? 7 : index % 7, 260 - index * 10));
    const [record] = calculationTaskRecords(saved);
    expect(record.attemptCount - 1).toBe(12);
    expect(calculationStartLabel(record)).toBe("もう一度挑戦する");
    record.history.forEach((point, index) => expect(point).toMatchObject({ id: saved[index].id, score: saved[index].score, elapsedSeconds: saved[index].elapsedSeconds, trialNo: index + 1 }));
  });
  it("derives day trends per task and resets the task trial number on each JST day", () => {
    const past = Date.parse("2026-10-09T10:00:00+09:00");
    const records = calculationTaskRecords([attempt(1, "①", 3, 260, past), attempt(2, "②", 7, 200, past), attempt(1, "①", 5, 180)]);
    expect(records.filter(r => r.taskId === "①").reverse().map(r => [r.dateKey, r.firstScore, r.firstElapsedSeconds])).toEqual([["2026-10-09", 3, 260], ["2026-10-10", 5, 180]]);
    expect(records.every(r => r.history[0].label === "初回")).toBe(true);
  });
  it("preserves unassigned legacy attempts without assigning them to a calculation card", () => {
    const saved = [attempt(1), attempt(2), attempt(3, "①")];
    const before = structuredClone(saved);
    expect(calculationTaskRecords(saved).find(r => !r.taskId)).toMatchObject({ taskLabel: "課題未指定", attemptCount: 2 });
    expect(calculationTaskRecords(saved).find(r => r.taskId === "①")).toMatchObject({ attemptCount: 1, firstScore: 3 });
    expect(saved).toEqual(before);
  });
  it("restores identical records after reload and keeps caller-scoped UID data separate", () => {
    const a = [attempt(1, "①", 3), attempt(2, "①", 7)], b = [attempt(1, "①", 0)];
    expect(calculationTaskRecords(JSON.parse(JSON.stringify(a)))).toEqual(calculationTaskRecords(a));
    expect(calculationTaskRecords(a)[0].bestScore).toBe(7);
    expect(calculationTaskRecords(b)[0].bestScore).toBe(0);
  });
  it("records a lower score beside a faster time without an improvement assessment", () => {
    const [record] = calculationTaskRecords([attempt(1, "①", 6, 260), attempt(2, "①", 3, 50)]);
    expect(record).toMatchObject({ firstScore: 6, latestScore: 3, firstElapsedSeconds: 260, latestElapsedSeconds: 50 });
    expect(record).not.toHaveProperty("improved");
  });
  it.each([0, 7])("accepts score %s and preserves the target task and seconds", score => {
    const record = attempt(1, "①", score, 0);
    expect(() => validateCalculationDraft(record)).not.toThrow();
    expect(calculationTaskRecords([record])[0].history[0]).toMatchObject({ taskId: "①", score, elapsedSeconds: 0 });
  });
  it.each(["", "a/b", "a".repeat(201)])("rejects invalid task ID %s", taskId => {
    expect(() => validateCalculationDraft({ ...attempt(1), taskId })).toThrow();
  });
  it("rejects a label without a task or an oversized label", () => {
    expect(() => validateCalculationDraft({ ...attempt(1), taskLabel: "①" })).toThrow();
    expect(() => validateCalculationDraft({ ...attempt(1, "①"), taskLabel: "a".repeat(301) })).toThrow();
  });
});
