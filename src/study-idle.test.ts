import { describe, expect, it } from "vitest";
import { BACKGROUND_REVIEW_MS, getIdleDeadline, getStudyStopReview, STUDY_IDLE_MS, USER_ACTIVITY_EVENTS } from "./study-idle";
import { prepareStudySessionOperation, type SessionTask, type StudySessionOperation } from "./study-session";
import { getStudyDuration } from "./study-utils";
import { claimRewards, getSessionActivityPoints } from "./game/rewards";
import { createInitialGameState } from "./game/config";
import { getWeekStudyMinutes } from "./game/progression";
import { createWeeklyResult, getWeekBoundsJst, hasPendingStudyReviewForWeek } from "./game/weekly";

const base = (): SessionTask => ({ id: "task", unit: "1", subject: "math", status: "in_progress", currentDuration: 0, sessionStartTime: 1000, lastUserActivityAt: 1000, sessionId: "session", isRunning: true, history: [] });
const op = (kind: StudySessionOperation["kind"], at: number, extra: Partial<StudySessionOperation> = {}): StudySessionOperation => ({ operationId: "operation", kind, at, taskId: "task", sessionId: "session", ...extra });
const apply = (task: SessionTask, operation: StudySessionOperation): SessionTask => ({ ...task, ...prepareStudySessionOperation([task], operation).updates.get(task.id) });

describe("15 minute review policy", () => {
  it("14:59 remains active and 15:00 ends exactly at the deadline even on a delayed return", () => {
    const task = base();
    expect(getStudyStopReview(task, 1000 + STUDY_IDLE_MS - 1000).reasons).toEqual([]);
    expect(getStudyStopReview(task, 1000 + STUDY_IDLE_MS)).toEqual({ endAt: 901000, reasons: ["idle"] });
    const stopped = apply(task, op("save", 2401000));
    expect(stopped.history[0]).toMatchObject({ endAt: 901000, duration: 900, reviewStatus: "pending", creditedDuration: 0 });
  });
  it("only five explicit interactions reset deadlines; overdue inputs do not resume", () => {
    expect(USER_ACTIVITY_EVENTS).toEqual(["pointerdown", "click", "keydown", "touchstart", "wheel"]);
    const changed = apply(base(), op("observe", 601000, { lastUserActivityAt: 601000 }));
    expect(getIdleDeadline(changed)).toBe(1501000);
    expect(prepareStudySessionOperation([base()], op("observe", 901000, { lastUserActivityAt: 901000 })).status).toBe("conflict");
  });
  it("PAUSE has no idle stop; RESUME resets the deadline while retaining review reasons", () => {
    const paused = apply(base(), op("pause", 601000));
    expect(getStudyStopReview(paused, 9999999).reasons).toEqual([]);
    const resumed = apply(paused, op("start", 2000000, { operationId: "resume" }));
    expect(getIdleDeadline(resumed)).toBe(2900000);
    expect(resumed.currentDuration).toBe(600);
  });
  it("4:59 background needs no review, 5:00 does, neither causes STOP", () => {
    const hidden = apply(base(), op("observe", 1000, { visibility: "hidden" }));
    expect(apply(hidden, op("observe", 1000 + BACKGROUND_REVIEW_MS - 1000, { visibility: "visible" })).backgroundReviewRequired).toBe(false);
    const visible = apply(hidden, op("observe", 1000 + BACKGROUND_REVIEW_MS, { visibility: "visible" }));
    expect(visible).toMatchObject({ isRunning: true, backgroundReviewRequired: true, lastUserActivityAt: 1000 });
    expect(apply(visible, op("save", 601000)).history[0].reviewStatus).toBe("pending");
  });
  it("manual STOP without an anomaly keeps existing validation and credit", () => {
    const saved = apply(base(), op("save", 601000));
    expect(saved.history[0]).toMatchObject({ duration: 600, creditedDuration: 600, reviewStatus: "not_required" });
  });
  it("pending gives no totals, weekly credit or rewards; confirmation grants credit only once", () => {
    const saved = apply(base(), op("save", 901000));
    const pending = { ...saved.history[0], id: "session" };
    expect(getStudyDuration(saved)).toBe(0);
    expect(getSessionActivityPoints(pending)).toBe(0);
    expect(getWeekStudyMinutes([pending], new Date(1000))).toBe(0);
    expect(claimRewards(createInitialGameState(), [pending]).claimedSessionIds).toEqual([]);
    const confirmed = apply(saved, op("confirm", 1000000, { confirmedDurationSeconds: 600 }));
    expect(confirmed.history[0]).toMatchObject({ reviewStatus: "confirmed", duration: 600, recordedDuration: 900, creditedDuration: 600, startAt: 301000, endAt: 901000 });
    expect(getStudyDuration(confirmed)).toBe(600);
    const entry = { ...confirmed.history[0], id: "session" };
    const rewarded = claimRewards(createInitialGameState(), [entry]);
    expect(rewarded.activityPoints).toBeGreaterThan(0);
    expect(claimRewards(rewarded, [entry]).activityPoints).toBe(rewarded.activityPoints);
    expect(prepareStudySessionOperation([confirmed], op("confirm", 1000001, { confirmedDurationSeconds: 0 })).status).toBe("duplicate");
  });
  it("zero confirmation grants no reward and survives JSON reload", () => {
    const saved: SessionTask = JSON.parse(JSON.stringify(apply(base(), op("save", 901000))));
    const confirmed = apply(saved, op("confirm", 1000000, { confirmedDurationSeconds: 0 }));
    expect(confirmed.history[0]).toMatchObject({ duration: 0, creditedDuration: 0, reviewStatus: "confirmed" });
    expect(getSessionActivityPoints({ ...confirmed.history[0], id: "session" })).toBe(0);
  });
  it("defers an affected weekly finalization and includes confirmed time afterwards", () => {
    const date = new Date("2026-10-05T00:00:00+09:00");
    const endAt = getWeekBoundsJst(date).startAt + 3600000;
    const pending = { id: "pending", duration: 900, endAt, reviewStatus: "pending" as const };
    expect(hasPendingStudyReviewForWeek([pending], date)).toBe(true);
    expect(createWeeklyResult(createInitialGameState(), [pending], date).actualMinutes).toBe(0);
    const confirmed = { ...pending, reviewStatus: "confirmed" as const, duration: 600 };
    expect(hasPendingStudyReviewForWeek([confirmed], date)).toBe(false);
    expect(createWeeklyResult(createInitialGameState(), [confirmed], date).actualMinutes).toBe(10);
  });
  it.each([-1, 901, 0.5, NaN])("rejects an invalid confirmed duration %s and retains pending", (seconds) => {
    const saved = apply(base(), op("save", 901000));
    expect(prepareStudySessionOperation([saved], op("confirm", 1000000, { confirmedDurationSeconds: seconds })).status).toBe("conflict");
    expect(saved.history[0].reviewStatus).toBe("pending");
  });
  it.each(["long_background", "clock_changed", "long_session"] as const)("confirmation cannot clear legacy invalid flag %s", (flag) => {
    const saved = apply({ ...base(), sessionReviewFlags: [flag] }, op("save", 901000));
    expect(apply(saved, op("confirm", 1000000, { confirmedDurationSeconds: 600 })).history[0].creditedDuration).toBe(0);
  });
  it("a stale idle STOP cannot cut off another device's later activity", () => {
    const changed = apply(base(), op("observe", 600000, { lastUserActivityAt: 600000 }));
    expect(prepareStudySessionOperation([changed], op("save", 901000, { reviewReasons: ["idle"] })).status).toBe("conflict");
  });
  it("confirming an old entry preserves a different active session", () => {
    const saved = apply(base(), op("save", 901000));
    const running = apply(saved, op("start", 1000000, { operationId: "new-session" }));
    expect(apply(running, op("confirm", 1000001, { confirmedDurationSeconds: 600 }))).toMatchObject({ sessionId: "new-session", isRunning: true });
  });
  it("background review persists through pause/resume and an observed long background stays invalid", () => {
    const hidden = { ...base(), hiddenSince: 1000 };
    const paused = apply(hidden, op("pause", 601000));
    const resumed = apply(paused, op("start", 602000, { operationId: "resume" }));
    expect(apply(resumed, op("save", 603000, { sessionId: "resume" })).history[0].reviewStatus).toBe("pending");
    const stopped = apply(hidden, op("save", 1801000));
    expect(stopped.history[0].reviewFlags).toContain("long_background");
    expect(apply(stopped, op("confirm", 1802000, { confirmedDurationSeconds: 900 })).history[0].creditedDuration).toBe(0);
    const longPaused = apply(hidden, op("pause", 1801000));
    const longResumed = apply(longPaused, op("start", 1802000, { operationId: "long-resume" }));
    expect(longResumed.sessionReviewFlags).toContain("long_background");
    const longSaved = apply(longResumed, op("save", 1803000, { sessionId: "long-resume" }));
    expect(apply(longSaved, op("confirm", 1804000, { sessionId: "long-resume", confirmedDurationSeconds: 900 })).history[0].creditedDuration).toBe(0);
  });
});
