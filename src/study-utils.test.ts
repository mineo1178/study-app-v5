import { describe, expect, it } from "vitest";
import {
  getElapsedSeconds,
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
