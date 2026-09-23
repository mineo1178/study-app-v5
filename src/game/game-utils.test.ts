import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./config";
import { getMonthlyGoalHours, getRivalBattle, getTokyoDomeMissions, getWeeklyGoalMinutes } from "./progression";
import { claimRewards, getSessionActivityPoints, lessonMember } from "./rewards";
import { getNextBonusGap, getTestBoost, testImportance } from "./test-bonus";

describe("producer game", () => {
  it("turns credited study time into activity points and never claims a session twice", () => {
    const entry = { id: "s1", duration: 1800, creditedDuration: 1800 };
    expect(getSessionActivityPoints(entry)).toBe(3);
    const first = claimRewards(createInitialGameState(), [entry]);
    expect(claimRewards(first, [entry]).activityPoints).toBe(3);
  });
  it("uses centralized monthly and weekly targets", () => { expect(getMonthlyGoalHours(new Date("2027-08-01"))).toBe(88); expect(getWeeklyGoalMinutes(new Date("2027-08-01"))).toBeGreaterThan(1200); });
  it("keeps permanent ability despite a losing week", () => { const game = createInitialGameState(); expect(getRivalBattle(10, 100).fanChange).toBeLessThan(0); expect(game.members[0].abilities.vocal).toBe(14); });
  it("requires lesson points and grows ability", () => { const game = { ...createInitialGameState(), activityPoints: 6 }; expect(lessonMember(game, "math", "vocal").members[0].abilities.vocal).toBe(16); });
  it("tracks all seven Tokyo Dome conditions", () => expect(getTokyoDomeMissions(createInitialGameState())).toHaveLength(7));
  it("makes judgment tests the most important and never creates a negative boost", () => {
    expect(testImportance("判定")).toBeGreaterThan(testImportance("組分け"));
    expect(testImportance("組分け")).toBeGreaterThan(testImportance("カリテ"));
    expect(getTestBoost("判定", -3)).toBe(0);
    expect(getTestBoost("組分け", 4)).toBe(10);
    expect(getNextBonusGap(2.7)).toBeCloseTo(1.3);
  });
});
