import { describe, expect, it } from "vitest";
import {
  getElapsedSeconds,
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
