import { describe, expect, it } from "vitest";
import { summarizeCalculation, type CalculationAttempt } from "./daily-calculation";
import { calculationAttemptTrend, calculationStartLabel } from "./daily-calculation-view";

const attempt = (attemptNo: number, score = 3, elapsedSeconds = 260, dateKey = "2026-10-10"): CalculationAttempt => ({
  id: `${dateKey}-${attemptNo}`, dateKey, attemptNo, score, elapsedSeconds, maxScore: 7,
  startedAt: Date.parse(`${dateKey}T00:00:00+09:00`), finishedAt: Date.parse(`${dateKey}T00:10:00+09:00`),
  attemptType: attemptNo === 1 ? "first" : "redo", createdAt: 1,
});

describe("daily calculation UX", () => {
  it("offers the first calculation when no daily record exists", () => {
    expect(calculationStartLabel()).toBe("計算をはじめる");
  });
  it.each([0, 3, 6])("offers unlimited redos after a first score of %s", (score) => {
    expect(calculationStartLabel(summarizeCalculation(undefined, attempt(1, score)))).toBe("解き直しをする");
    expect(calculationStartLabel({ ...summarizeCalculation(undefined, attempt(1, score)), attemptCount: 100 })).toBe("解き直しをする");
  });
  it("offers another challenge after reaching 7/7, even if a later score drops", () => {
    const completed = summarizeCalculation(undefined, attempt(1, 7));
    expect(calculationStartLabel(completed)).toBe("もう一度挑戦する");
    expect(calculationStartLabel(summarizeCalculation(completed, attempt(2, 5)))).toBe("もう一度挑戦する");
  });
  it("keeps 15 attempts in sequence with exact score/second values and never mutates saved records", () => {
    const saved = Array.from({ length: 15 }, (_, index) => attempt(index + 1, index % 8, 300 - index * 13)).reverse();
    const before = structuredClone(saved);
    const trend = calculationAttemptTrend(saved, "2026-10-10");
    expect(trend).toHaveLength(15);
    trend.forEach((point, index) => {
      const record = saved.find((item) => item.id === point.id)!;
      expect(point).toEqual({ id: record.id, attemptNo: index + 1, label: index === 0 ? "初回" : `解き直し${index}回目`, score: record.score, elapsedSeconds: record.elapsedSeconds });
    });
    expect(saved).toEqual(before);
  });
  it("selects past-day attempts only and excludes stale records from the previous selection", () => {
    const saved = [attempt(1), attempt(2), attempt(1, 7, 0, "2026-10-09")];
    expect(calculationAttemptTrend(saved, "2026-10-09")).toEqual([{ id: "2026-10-09-1", attemptNo: 1, label: "初回", score: 7, elapsedSeconds: 0 }]);
    expect(calculationAttemptTrend(saved, "2026-10-08")).toEqual([]);
  });
  it("rebuilds identical chart/list data after saved records are restored", () => {
    const saved = [attempt(1, 0, 0), attempt(2, 7, 14400)];
    expect(calculationAttemptTrend(JSON.parse(JSON.stringify(saved)), "2026-10-10")).toEqual(calculationAttemptTrend(saved, "2026-10-10"));
  });
  it("retains declining scores beside shorter times without creating an improvement assessment", () => {
    expect(calculationAttemptTrend([attempt(1, 6, 260), attempt(2, 3, 50)], "2026-10-10")).toEqual([
      { id: "2026-10-10-1", attemptNo: 1, label: "初回", score: 6, elapsedSeconds: 260 },
      { id: "2026-10-10-2", attemptNo: 2, label: "解き直し1回目", score: 3, elapsedSeconds: 50 },
    ]);
  });
  it("preserves saved attempt numbers when a snapshot contains gaps instead of renumbering or inventing records", () => {
    const trend = calculationAttemptTrend([attempt(12), attempt(1), attempt(4)], "2026-10-10");
    expect(trend.map(point => [point.attemptNo, point.label])).toEqual([[1, "初回"], [4, "解き直し3回目"], [12, "解き直し11回目"]]);
    expect(trend).toHaveLength(3);
  });
});
