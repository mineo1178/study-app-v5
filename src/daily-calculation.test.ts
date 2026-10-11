import { describe, expect, it } from "vitest";
import { calculationAttemptLabel, calculationDayState, calculationStorageKey, getCalculationElapsedSeconds, getJstDateKey, MAX_CALCULATION_SECONDS, summarizeCalculation, validateCalculationDraft, type CalculationAttempt, type CalculationDay } from "./daily-calculation";
const attempt = (attemptNo: number, score = 3, elapsedSeconds = 260): CalculationAttempt => ({ id: `attempt-${attemptNo}`, dateKey: "2026-10-10", score, maxScore: 7, elapsedSeconds, startedAt: Date.parse("2026-10-10T00:00:00+09:00"), finishedAt: Date.parse("2026-10-10T00:10:00+09:00"), attemptNo, attemptType: attemptNo === 1 ? "first" : "redo", createdAt: 1 });
describe("daily calculation records", () => {
  it("uses a monotonic anchor, keeps running beyond 15 minutes and never adds repeated ticks twice", () => {
    expect(getCalculationElapsedSeconds(0, 1000, 1000 + 16 * 60000)).toBe(960);
    expect(getCalculationElapsedSeconds(30, 1000, 16000)).toBe(45);
    expect(getCalculationElapsedSeconds(30, 1000, 16000)).toBe(45);
    expect(getCalculationElapsedSeconds(30, 1000, 500)).toBe(30);
  });
  it("restores a saved baseline with a fresh monotonic anchor and caps unreasonable durations", () => {
    expect(getCalculationElapsedSeconds(48, 0, 2000)).toBe(50);
    expect(getCalculationElapsedSeconds(0, 0, 86400000)).toBe(MAX_CALCULATION_SECONDS);
  });
  it.each([0, 7])("accepts integer score %s and records seconds", (score) => { expect(() => validateCalculationDraft(attempt(1, score))).not.toThrow(); expect(attempt(1, score).elapsedSeconds).toBe(260); });
  it.each([8, -1, 0.5, NaN])("rejects score %s", (score) => expect(() => validateCalculationDraft(attempt(1, score))).toThrow());
  it.each([-1, 0.5, MAX_CALCULATION_SECONDS + 1])("rejects duration %s", (seconds) => expect(() => validateCalculationDraft(attempt(1, 3, seconds))).toThrow());
  it("preserves the first attempt after more than ten redos, latest and best are independent", () => {
    let day: CalculationDay | undefined;
    const history = Array.from({ length: 15 }, (_, index) => attempt(index + 1, index === 10 ? 7 : 3, 260 - index));
    history.forEach((item) => { day = summarizeCalculation(day, item); });
    expect(day).toMatchObject({ attemptCount: 15, firstScore: 3, firstElapsedSeconds: 260, latestScore: 3, latestElapsedSeconds: 246, bestScore: 7 });
    expect(history).toHaveLength(15); expect(history[0]).toEqual(attempt(1));
    expect(calculationDayState(day)).toBe("解き直し中");
    expect(calculationDayState(summarizeCalculation(day, attempt(16, 7)))).toBe("今日の計算 完了");
    expect(calculationAttemptLabel(1)).toBe("1回目"); expect(calculationAttemptLabel(15)).toBe("解き直し14回目");
  });
  it("handles empty and one day and keeps all 30 daily first scores/times", () => {
    expect(calculationDayState()).toBe("未実施"); expect(calculationDayState(summarizeCalculation(undefined, attempt(1)))).toBe("初回済み");
    const days = Array.from({ length: 30 }, (_, i) => summarizeCalculation(undefined, { ...attempt(1, i % 8, 300 + i), dateKey: getJstDateKey(Date.parse("2026-09-11T00:00:00+09:00") + i * 86400000) }));
    expect(days).toHaveLength(30); expect(days.at(-1)).toMatchObject({ firstScore: 5, firstElapsedSeconds: 329 });
  });
  it("uses the start JST day across midnight and Sunday/Monday/year boundaries", () => {
    expect(getJstDateKey(Date.parse("2026-10-10T14:59:59Z"))).toBe("2026-10-10");
    expect(getJstDateKey(Date.parse("2026-10-10T15:00:00Z"))).toBe("2026-10-11");
    expect(getJstDateKey(Date.parse("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
    const crossing = { ...attempt(1), startedAt: Date.parse("2026-10-10T23:59:59+09:00"), finishedAt: Date.parse("2026-10-11T00:01:00+09:00") };
    expect(() => validateCalculationDraft(crossing)).not.toThrow();
    expect(() => validateCalculationDraft({ ...crossing, dateKey: "2026-10-11" })).toThrow();
  });
  it("separates family, UID and date storage without touching study/rewards", () => {
    expect(calculationStorageKey("family", "a", "2026-10-10")).not.toBe(calculationStorageKey("family", "b", "2026-10-10"));
    expect(calculationStorageKey("family", "a", "2026-10-10")).not.toBe(calculationStorageKey("family", "a", "2026-10-11"));
    expect(Object.keys(summarizeCalculation(undefined, attempt(1)))).not.toContain("activityPoints");
  });
});
