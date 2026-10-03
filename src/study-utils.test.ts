import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getElapsedSeconds,
  mergeSyncedTasks,
  subscribeTimerVisibility,
  getLatestRunningTask,
  getDuplicateTimerUpdates,
  getPausedTaskUpdates,
  getCreditedStudyMinutes,
  getSessionReviewFlags,
  getStudyDuration,
  getSubjectTaskStats,
  getTaskStats,
  removeTasksForUnit,
  type StudyTaskLike,
} from "./study-utils";

const task = (overrides: Partial<StudyTaskLike> = {}): StudyTaskLike => ({
  id: "task-1",
  unit: "第14回",
  subject: "math",
  status: "not_started",
  currentDuration: 0,
  sessionStartTime: null,
  isRunning: false,
  history: [],
  ...overrides,
});

describe("timer helpers", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps running while hidden and resumes from wall time without timer ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const target = Object.assign(new EventTarget(), { hidden: false });
    const running = task({ isRunning: true, sessionStartTime: 1000, currentDuration: 20 });
    const resume = vi.fn();
    const review = vi.fn();
    const cleanup = subscribeTimerVisibility(target, running, resume, review);
    target.hidden = true;
    target.dispatchEvent(new Event("visibilitychange"));
    vi.setSystemTime(601000);
    expect(running.isRunning).toBe(true);
    expect(resume).not.toHaveBeenCalled();
    expect(getElapsedSeconds(running)).toBe(620);
    target.hidden = false;
    target.dispatchEvent(new Event("visibilitychange"));
    target.dispatchEvent(new Event("visibilitychange"));
    expect(resume.mock.calls).toEqual([[620], [620]]);
    expect(review).not.toHaveBeenCalled();
    cleanup();
    target.dispatchEvent(new Event("visibilitychange"));
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it("preserves the existing long-background review across subscription renewal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const target = Object.assign(new EventTarget(), { hidden: true });
    const running = task({ isRunning: true, sessionStartTime: 1000 });
    const hiddenAt = { current: null as number | null };
    const review = vi.fn();
    const cleanup = subscribeTimerVisibility(target, running, vi.fn(), review, hiddenAt);
    vi.setSystemTime(901000);
    cleanup();
    const cleanupNext = subscribeTimerVisibility(target, running, vi.fn(), review, hiddenAt);
    vi.setSystemTime(1801000);
    target.hidden = false;
    target.dispatchEvent(new Event("visibilitychange"));
    expect(review).toHaveBeenCalledTimes(1);
    expect(running.isRunning).toBe(true);
    cleanupNext();
  });

  it("ignores visibility changes for a paused timer", () => {
    const target = Object.assign(new EventTarget(), { hidden: false });
    const resume = vi.fn();
    const review = vi.fn();
    const cleanup = subscribeTimerVisibility(target, task(), resume, review);
    target.hidden = true;
    target.dispatchEvent(new Event("visibilitychange"));
    target.hidden = false;
    target.dispatchEvent(new Event("visibilitychange"));
    expect(resume).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    cleanup();
  });

  it("accepts another client's STOP despite a newer local display timestamp", () => {
    const local = { ...task({ isRunning: true, sessionStartTime: 1000 }), lastUpdatedAt: 900000, pendingSync: false };
    const remote = { ...local, ...getPausedTaskUpdates(local, 601000), pendingSync: false };
    const restored = mergeSyncedTasks([local], [remote]);
    expect(restored).toEqual([remote]);
    expect(getLatestRunningTask(restored)).toBeUndefined();
    expect(getElapsedSeconds(restored[0], 999999)).toBe(600);
    expect(restored[0].history).toEqual([]);
  });

  it("converges both client views on the latest START and captures the old cloud STOP before state changes", () => {
    const older = { ...task({ id: "a", isRunning: true, sessionStartTime: 1000 }), pendingSync: false };
    const newer = { ...task({ id: "b", isRunning: true, sessionStartTime: 601000 }), pendingSync: false };
    const cloud = [older, newer];
    const viewA = mergeSyncedTasks([older, task({ id: "b" })], cloud);
    const viewB = mergeSyncedTasks([task({ id: "a" }), newer], cloud);
    expect(getLatestRunningTask(viewA)?.id).toBe("b");
    expect(getLatestRunningTask(viewB)?.id).toBe("b");
    const writes = getDuplicateTimerUpdates(viewA, 602000);
    const nextState = viewA.map((entry) => ({ ...entry, ...writes.find((write) => write.id === entry.id)?.updates }));
    expect(writes).toEqual([{ id: "a", updates: getPausedTaskUpdates(older, 602000) }]);
    expect(getLatestRunningTask(nextState)?.id).toBe("b");
    expect(getDuplicateTimerUpdates(nextState, 603000)).toEqual([]);
  });

  it("resolves simultaneous START ties independently of client ordering", () => {
    const a = task({ id: "a", isRunning: true, sessionStartTime: 1000 });
    const b = task({ id: "b", isRunning: true, sessionStartTime: 1000 });
    expect(getLatestRunningTask([a, b])?.id).toBe("a");
    expect(getLatestRunningTask([b, a])?.id).toBe("a");
  });

  it("protects unsent operations while accepting cloud state after acknowledgement", () => {
    const local = { ...task({ isRunning: true, sessionStartTime: 1000 }), pendingSync: true };
    const cloud = { ...task(), pendingSync: false };
    expect(mergeSyncedTasks([local], [cloud])).toEqual([local]);
    expect(mergeSyncedTasks([{ ...local, pendingSync: false }], [cloud])).toEqual([cloud]);
    expect(mergeSyncedTasks([local], [])).toEqual([local]);
    expect(mergeSyncedTasks([{ ...local, pendingSync: false }], [])).toEqual([]);
  });
  it.each([60, 180, 299, 300, 301, 601])("continues for %i seconds and saves the real duration on manual pause", (seconds) => {
    const running = task({ isRunning: true, sessionStartTime: 1000 });
    expect(getLatestRunningTask([running])).toBe(running);
    expect(getElapsedSeconds(running, 1000 + seconds * 1000)).toBe(seconds);
    expect(getDuplicateTimerUpdates([running], 1000 + seconds * 1000)).toEqual([]);
    const paused = { ...running, ...getPausedTaskUpdates(running, 1000 + seconds * 1000) };
    expect(paused.isRunning).toBe(false);
    expect(getElapsedSeconds(paused, 9999999)).toBe(seconds);
    expect(getCreditedStudyMinutes(seconds)).toBe(seconds < 600 ? 0 : 10);
  });

  it("keeps the newly started timer even when an older timer has a newer heartbeat", () => {
    const older = { ...task({ id: "old", isRunning: true, sessionStartTime: 1000 }), lastUpdatedAt: 190000 };
    const newer = { ...task({ id: "new", isRunning: true, sessionStartTime: 181000 }), lastUpdatedAt: 181000 };
    expect(getLatestRunningTask([older, newer])).toBe(newer);
    expect(getDuplicateTimerUpdates([older, newer], 190000).map((update) => update.id)).toEqual(["old"]);
    const paused = getPausedTaskUpdates(older, 181000);
    expect(paused).toMatchObject({ isRunning: false, currentDuration: 180, pendingSync: true });
    expect(getLatestRunningTask([{ ...older, ...paused }, newer])).toBe(newer);
  });

  it("uses elapsed wall time across hidden, unmount and reload without ticks", () => {
    const running = task({ isRunning: true, sessionStartTime: 1000 });
    const restored = JSON.parse(JSON.stringify(running));
    expect(getElapsedSeconds(restored, 302000)).toBe(301);
    expect(getLatestRunningTask([restored])?.isRunning).toBe(true);
  });
  it("calculates elapsed time while running and preserves it while paused", () => {
    expect(
      getElapsedSeconds(
        task({ isRunning: true, currentDuration: 30, sessionStartTime: 1_000 }),
        6_500,
      ),
    ).toBe(35);
    expect(
      getElapsedSeconds(task({ currentDuration: 35, sessionStartTime: null }), 999_999),
    ).toBe(35);
  });

  it("continues past five minutes without user input", () => {
    expect(
      getElapsedSeconds(task({ isRunning: true, sessionStartTime: 0 }), 5 * 60 * 1000 + 1_000),
    ).toBe(301);
  });

  it("keeps pause and resume segments additive at thirty minutes", () => {
    const pausedDuration = getElapsedSeconds(
      task({ isRunning: true, sessionStartTime: 0 }),
      20 * 60 * 1000,
    );
    const finalDuration = getElapsedSeconds(
      task({ isRunning: true, currentDuration: pausedDuration, sessionStartTime: 25 * 60 * 1000 }),
      35 * 60 * 1000,
    );
    expect(finalDuration).toBe(30 * 60);
  });

  it("restores a running session from its persisted start time without double counting", () => {
    expect(
      getElapsedSeconds(task({ isRunning: true, currentDuration: 20 * 60, sessionStartTime: 1_000 }), 10 * 60 * 1000 + 1_000),
    ).toBe(30 * 60);
  });

  it("does not create time when the wall clock moves backwards", () => {
    expect(
      getElapsedSeconds(task({ isRunning: true, currentDuration: 120, sessionStartTime: 10_000 }), 1_000),
    ).toBe(120);
  });

  it("flags long sessions", () => {
    expect(getSessionReviewFlags(2 * 60 * 60)).toEqual(["long_session"]);
  });

  it("does not credit suspicious or too-short sessions", () => {
    expect(getCreditedStudyMinutes(2 * 60 * 60, ["long_session"])).toBe(0);
    expect(getCreditedStudyMinutes(9 * 60)).toBe(0);
    expect(getCreditedStudyMinutes(30 * 60, ["long_background"])).toBe(0);
  });

  it("caps normal credited study time at sixty minutes", () => {
    expect(getCreditedStudyMinutes(90 * 60)).toBe(60);
  });
});

describe("study aggregation", () => {
  const tasks = [
    task({ id: "a", status: "completed", currentDuration: 60, history: [{ duration: 120 }] }),
    task({ id: "b", subject: "japanese", status: "in_progress", history: [{ duration: 30 }] }),
    task({ id: "c", status: "completed", currentDuration: 15 }),
  ];

  it("totals durations and completion progress", () => {
    expect(getStudyDuration(tasks[0])).toBe(180);
    expect(getTaskStats(tasks)).toEqual({ progress: 67, totalTime: 225 });
  });

  it("aggregates a selected subject only", () => {
    expect(getSubjectTaskStats(tasks, "math")).toEqual({ progress: 100, totalTime: 195 });
    expect(getSubjectTaskStats(tasks, "science")).toEqual({ progress: 0, totalTime: 0 });
  });
});

describe("unit deletion helper", () => {
  it("removes only tasks from the selected unit", () => {
    const tasks = [task({ id: "a", unit: "第14回" }), task({ id: "b", unit: "第13回" })];
    expect(removeTasksForUnit(tasks, "第14回")).toEqual([tasks[1]]);
  });
});
