import { describe, expect, it } from "vitest";
import { summarizeCalculation, type CalculationAttempt } from "./daily-calculation";
import { calculationChartSeries, calculationGoalMet, calculationAttemptTrend, calculationDateTrend, calculationStartLabel } from "./daily-calculation-view";

const attempt = (attemptNo: number, score = 3, elapsedSeconds = 260, dateKey = "2026-10-10"): CalculationAttempt => ({
  id: `${dateKey}-${attemptNo}`, dateKey, attemptNo, score, elapsedSeconds, maxScore: 7,
  startedAt: Date.parse(`${dateKey}T00:00:00+09:00`), finishedAt: Date.parse(`${dateKey}T00:10:00+09:00`),
  attemptType: attemptNo === 1 ? "first" : "redo", createdAt: 1,
});

describe("daily calculation UX", () => {
  it("averages exactly the records shown for each chart range", () => {
    const points = [
      ...Array.from({ length: 10 }, () => ({ score: 1, elapsedSeconds: 180 })),
      ...Array.from({ length: 20 }, () => ({ score: 4, elapsedSeconds: 120 })),
      ...Array.from({ length: 10 }, () => ({ score: 7, elapsedSeconds: 60 })),
    ];
    expect(calculationChartSeries(points, 10, "score")).toEqual({ entries: points.slice(30), average: 7 });
    expect(calculationChartSeries(points, 30, "score").average).toBe(5);
    expect(calculationChartSeries(points, "all", "score").average).toBe(4);
    expect(([10, 30, "all"] as const).map(range => calculationChartSeries(points, range, "elapsedSeconds").average)).toEqual([60, 100, 120]);
    expect(calculationChartSeries([], "all", "score").average).toBeNull();
  });

  it("counts equality and applies the right direction for each goal", () => {
    expect([4, 5, 6].map(value => calculationGoalMet("score", value, 5))).toEqual([false, true, true]);
    expect([59, 60, 61].map(value => calculationGoalMet("elapsedSeconds", value, 60))).toEqual([true, true, false]);
  });

  it("orders saved JST days across month/year boundaries, without inventing missing days", () => {
    const saved = ["2026-02-01", "2025-12-31", "2026-01-01"].map(date => ({ ...attempt(1, 7, 10, date), taskId: "a" }));
    const before = structuredClone(saved);
    expect(calculationDateTrend(saved, "a").map(point => point.label)).toEqual(["2025-12-31", "2026-01-01", "2026-02-01"]);
    expect(saved).toEqual(before);
    expect(calculationDateTrend(saved, "other")).toEqual([]);
    expect(calculationDateTrend([], "")).toEqual([]);
  });
  it("distinguishes task-local first/latest/best and never combines different task IDs", () => {
    const saved = [attempt(5, 2), attempt(2, 7), attempt(1, 1), attempt(3, 6)].map(item => ({ ...item, taskId: item.attemptNo === 1 ? "other" : "a" }));
    expect(calculationDateTrend(saved, "a", "first")[0].score).toBe(7);
    expect(calculationDateTrend(saved, "a", "latest")[0].score).toBe(2);
    expect(calculationDateTrend(saved, "a", "best")[0].score).toBe(7);
    expect(calculationDateTrend(saved, "other")[0].score).toBe(1);
    expect(calculationDateTrend([attempt(1)], "")).toEqual([{ label: "2026-10-10", score: 3, elapsedSeconds: 260 }]);
  });
  it("uses the first attempt of the earliest-started task per saved day across task IDs", () => {
    const later = { ...attempt(1, 2, 120), taskId: "later" };
    later.startedAt += 60_000;
    const earliest = { ...attempt(2, 0, 80), taskId: "earliest" };
    const redo = { ...attempt(3, 7, 45), taskId: "earliest" };
    const nextDay = { ...attempt(1, 5, 90, "2026-10-12"), taskId: "different" };
    expect(calculationDateTrend([later, earliest, redo, nextDay], null, "best")).toEqual([
      { label: "2026-10-10", score: 0, elapsedSeconds: 80 },
      { label: "2026-10-12", score: 5, elapsedSeconds: 90 },
    ]);
  });

  it("retains all loaded days beyond 30 and preserves a genuine saved zero", () => {
    const saved = Array.from({ length: 40 }, (_, i) => ({ ...attempt(1, i === 39 ? 0 : 7, 10, new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10)), taskId: "a" }));
    const trend = calculationDateTrend(saved, "a");
    expect(trend).toHaveLength(40);
    expect(trend.at(-1)?.score).toBe(0);
  });
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
