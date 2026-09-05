import { describe, expect, it } from "vitest";
import {
  getElapsedSeconds,
  getCreditedStudyMinutes,
  getSessionReviewFlags,
  getStarReward,
  getRewardTotals,
  getUnlockedItems,
  getCollectionProgress,
  getNextRewards,
  getDailyMissions,
  getWeeklyProgress,
  getSetCompletion,
  canEquipItem,
  AVATAR_ITEMS,
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

  it("keeps recorded time but holds credit for suspicious sessions", () => {
    expect(getSessionReviewFlags(2 * 60 * 60)).toEqual(["long_session"]);
    expect(getCreditedStudyMinutes(2 * 60 * 60, ["long_session"])).toBe(0);
    expect(getCreditedStudyMinutes(9 * 60)).toBe(0);
    expect(getCreditedStudyMinutes(90 * 60)).toBe(60);
    expect(getCreditedStudyMinutes(30 * 60, ["long_background"])).toBe(0);
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

describe("avatar rewards", () => {
  const at = (date: string) => new Date(`${date}T10:00:00+09:00`).getTime();
  const rewardTask = (
    subject: StudyTaskLike["subject"],
    creditedMinutes: number,
    overrides: Partial<StudyTaskLike["history"][number]> = {},
  ) =>
    task({
      subject,
      history: [
        {
          duration: 5 * 60 * 60,
          creditedDuration: creditedMinutes * 60,
          startAt: at("2026-09-05"),
          endAt: at("2026-09-05") + creditedMinutes * 60 * 1000,
          ...overrides,
        },
      ],
    });

  it("does not count sessions before GAME_START_DATE", () => {
    const totals = getRewardTotals([
      rewardTask("math", 30, { startAt: at("2026-09-04"), endAt: at("2026-09-04") }),
    ]);
    expect(totals.stars).toBe(0);
  });

  it("uses creditedDuration instead of raw duration for stars", () => {
    const totals = getRewardTotals([rewardTask("math", 30)]);
    expect(totals.stars).toBe(30);
    expect(getStarReward(30)).toBe(30);
  });

  it("does not reward review-flagged sessions", () => {
    const totals = getRewardTotals([
      rewardTask("math", 30, { reviewFlags: ["long_background"] }),
    ]);
    expect(totals.stars).toBe(0);
  });

  it("keeps the sixty minute credit cap from creditedDuration", () => {
    expect(getCreditedStudyMinutes(90 * 60)).toBe(60);
    expect(getRewardTotals([rewardTask("math", 60)]).stars).toBe(60);
  });

  it("unlocks star and subject based items deterministically", () => {
    const unlocked = getUnlockedItems([
      rewardTask("math", 60),
      rewardTask("japanese", 60),
    ]);
    expect(unlocked.map((item) => item.id)).toContain("pink-nail");
    expect(unlocked.map((item) => item.id)).toContain("star-earrings");
    expect(unlocked.map((item) => item.id)).toContain("sakura-ribbon");
  });

  it("keeps locked items visible in collection progress", () => {
    const unlocked = getUnlockedItems([rewardTask("math", 20)]);
    const progress = getCollectionProgress(unlocked);
    expect(progress.find((p) => p.category === "nail")).toEqual({
      category: "nail",
      unlocked: 1,
      total: 6,
    });
    expect(AVATAR_ITEMS.length).toBe(24);
  });

  it("reports set completion", () => {
    const allUnlocked = AVATAR_ITEMS.filter((item) =>
      ["sakura-nail", "sakura-ribbon", "sakura-outfit", "sakura-bg"].includes(item.id),
    );
    expect(getSetCompletion(allUnlocked).find((set) => set.id === "sakura-set")?.completed).toBe(true);
  });

  it("shows the nearest next rewards", () => {
    const next = getNextRewards([rewardTask("math", 18)], 1);
    expect(next[0].item.id).toBe("pink-nail");
    expect(next[0].remaining).toBe(2);
  });

  it("tracks daily missions and weekly study days without strict streaks", () => {
    const monday = at("2026-09-07");
    const tuesday = at("2026-09-08");
    const tasks = [
      rewardTask("math", 10, { startAt: monday, endAt: monday }),
      rewardTask("japanese", 20, { startAt: monday + 60_000, endAt: monday + 60_000 }),
      rewardTask("science", 10, { startAt: tuesday, endAt: tuesday }),
    ];
    expect(getDailyMissions(tasks, new Date(monday))[1].completed).toBe(true);
    expect(getWeeklyProgress(tasks, new Date(tuesday)).days).toBe(2);
  });

  it("allows only unlocked equipment", () => {
    const unlocked = getUnlockedItems([rewardTask("math", 20)]);
    expect(canEquipItem("pink-nail", unlocked)).toBe(true);
    expect(canEquipItem("heart-necklace", unlocked)).toBe(false);
  });
});
