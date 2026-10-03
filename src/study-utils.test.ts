import { describe, expect, it } from "vitest";
import {
  getElapsedSeconds,
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
