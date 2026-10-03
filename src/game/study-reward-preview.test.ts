import { describe, expect, it } from "vitest";
import { getStudyRewardPreview } from "./study-reward-preview";
import { normalizeGachaState, getNextTicketThreshold } from "./gacha/logic";
import { ACTIVITY_POINT_MINUTES } from "./config";
import { getWeeklyGoalMinutes } from "./progression";
import type { StudyTaskLike } from "../study-utils";
const now = new Date("2026-10-03T12:00:00+09:00").getTime();
const running = (minutes: number): StudyTaskLike => ({ id: "t", unit: "u", subject: "math", status: "in_progress", history: [], currentDuration: 0, sessionStartTime: now - minutes * 60000, isRunning: true });
const preview = (minutes = 0) => getStudyRewardPreview([running(minutes)], [], [], normalizeGachaState(), now);
describe("next study rewards", () => {
  it.each([0, 3, 9])("counts down at %i minutes using the existing activity point condition", (minutes) => expect(preview(minutes).rewards.find((r) => r.id === "points")?.remaining).toBe(ACTIVITY_POINT_MINUTES - minutes));
  it.each([10, 11])("offers saving at and above the condition (%i)", (minutes) => expect(preview(minutes).rewards[0]).toMatchObject({ id: "points-save", remaining: 0 }));
  it("updates after elapsed study time changes", () => expect(preview(4).rewards[0].remaining).toBe(preview(3).rewards[0].remaining - 1));
  it("sorts nearby rewards and limits to three", () => {
    const result = getStudyRewardPreview([running(10)], [{ id: "h", duration: 600, endAt: now }], [], normalizeGachaState({ ticketBalances: { normal: 1, silver: 0, gold: 0, premium: 0 }, itemInventory: { "vocal-n": 1 } }), now);
    expect(result.rewards).toHaveLength(3);
    expect(result.rewards.every((r, i, a) => !i || a[i - 1].remaining <= r.remaining)).toBe(true);
  });
  it("shows available gacha and item actions", () => {
    const result = getStudyRewardPreview([], [], [], normalizeGachaState({ ticketBalances: { normal: 1, silver: 0, gold: 0, premium: 0 }, itemInventory: { "vocal-n": 1 } }), now);
    expect(result.rewards.map((r) => r.id)).toEqual(["gacha-ready", "item-ready", "points"]);
  });
  it("uses the existing weekly threshold without inventing daily item rewards", () => {
    expect(preview().rewards.find((r) => r.id === "gacha")?.remaining).toBe(getNextTicketThreshold(0, getWeeklyGoalMinutes(new Date(now))).minutesToNext);
    expect(preview().rewards.some((r) => r.id.startsWith("item"))).toBe(false);
  });
  it("shows MAX after all weekly goals and keeps study available", () => {
    const result = getStudyRewardPreview([running(60)], [{ id: "h", duration: getWeeklyGoalMinutes(new Date(now)) * 1.2 * 60, endAt: now }], ["h"], normalizeGachaState(), now);
    expect(result.rewards.some((r) => r.id === "gacha-max")).toBe(true);
    expect(result.capped).toBe(true);
  });
  it("does not include suspicious sessions in reward forecasts", () => {
    const result = getStudyRewardPreview([{ ...running(30), sessionReviewFlags: ["long_background"] }], [], [], normalizeGachaState(), now);
    expect(result.todayMinutes).toBe(0);
    expect(result.rewards.some((r) => r.id.startsWith("points"))).toBe(false);
  });
  it("separates JST today from yesterday across midnight", () => {
    const midnight = new Date("2026-10-04T00:00:00+09:00").getTime();
    const result = getStudyRewardPreview([], [{ id: "yesterday", duration: 600, creditedDuration: 600, endAt: midnight - 1 }, { id: "today", duration: 600, creditedDuration: 600, endAt: midnight }], [], normalizeGachaState(), midnight);
    expect(result.todayMinutes).toBe(10);
  });
});
