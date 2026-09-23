import { describe, expect, it } from "vitest";
import type { Performance } from "./types";
import { createInitialGameState } from "./config";
import { applyFanChange, getMonthlyGoalHours, getMonthlyGoalMinutes, getRivalBattle, getTokyoDomeMissions, getWeeklyGoalMinutes } from "./progression";
import { canRecruitThirdMember, claimRewards, getSessionActivityPoints, joinNextMember, lessonMember, recruitThirdMember } from "./rewards";
import { calculateBoostedPoints, getHighestBoost, getNextBonusGap, getTestBoost, testImportance } from "./test-bonus";
import { createWeeklyResult, getUnfinalizedWeeks, getWeekBoundsJst, getWeekIdJst, isFinalizableWeek } from "./weekly";
import { canCreateSong, calculateAudience, calculateFanGain, createSong, getLiveRating, getNextGoal, isVenueSoldOut, isVenueUnlocked } from "./song-live";
import { calculateBattleStats, calculateRivalBattleResult, canStartRivalBattle, getBattleImprovementHint, getRivalBattleRewards } from "./rival-battle";

describe("producer game", () => {
  it("turns credited study time into activity points and never claims a session twice", () => {
    const entry = { id: "s1", duration: 1800, creditedDuration: 1800 };
    expect(getSessionActivityPoints(entry)).toBe(3);
    const first = claimRewards(createInitialGameState(), [entry]);
    expect(claimRewards(first, [entry]).activityPoints).toBe(3);
  });
  it("uses centralized monthly and weekly targets", () => { expect(getMonthlyGoalHours(new Date("2027-08-01"))).toBe(88); expect(getWeeklyGoalMinutes(new Date("2027-08-01"))).toBeGreaterThan(1200); });
  it("prorates the September 2026 goal from the game start", () => expect(getMonthlyGoalMinutes(new Date("2026-09-25"))).toBeLessThan(43 * 60));
  it("keeps permanent ability despite a losing week", () => { const game = createInitialGameState(); expect(getRivalBattle(10, 100).fanChange).toBeLessThan(0); expect(game.members[0].abilities.vocal).toBe(14); });
  it("requires lesson points and grows ability", () => { const game = { ...createInitialGameState(), activityPoints: 6 }; expect(lessonMember(game, "math", "vocal").members[0].abilities.vocal).toBe(16); });
  it("changes fans safely for wins and losses without going below zero", () => { expect(applyFanChange(10, getRivalBattle(100, 100).fanChange)).toBeGreaterThan(10); expect(applyFanChange(10, getRivalBattle(1, 100).fanChange)).toBe(0); });
  it("unlocks the next member with activity points", () => { const game = { ...createInitialGameState(), activityPoints: 18 }; expect(joinNextMember(game).members.filter((member) => member.joined)).toHaveLength(2); });
  it("tracks all seven Tokyo Dome conditions", () => expect(getTokyoDomeMissions(createInitialGameState())).toHaveLength(7));
  it("makes judgment tests the most important and never creates a negative boost", () => {
    expect(testImportance("判定")).toBeGreaterThan(testImportance("組分け"));
    expect(testImportance("組分け")).toBeGreaterThan(testImportance("カリテ"));
    expect(getTestBoost("判定", -3)).toBe(0);
    expect(getTestBoost("組分け", 4)).toBe(10);
    expect(getNextBonusGap(2.7)).toBeCloseTo(1.3);
  });
  it("uses stable JST Monday weeks and excludes pre-game weeks", () => {
    expect(getWeekIdJst(new Date("2026-09-27T14:59:00Z"))).toBe("2026-W39");
    expect(getWeekIdJst(new Date("2026-09-27T15:00:00Z"))).toBe("2026-W40");
    expect(getWeekBoundsJst(new Date("2026-09-28")).startAt).toBeLessThan(getWeekBoundsJst(new Date("2026-09-28")).endAt);
    expect(isFinalizableWeek(new Date("2026-09-20"), new Date("2026-10-01"))).toBe(false);
  });
  it("records a weekly fan result without touching permanent growth", () => {
    const game = createInitialGameState(); const result = createWeeklyResult(game, [{ duration: 20 * 60, endAt: new Date("2026-10-05T01:00:00+09:00").getTime() }], new Date("2026-10-06"));
    expect(result.fanAfter).toBeGreaterThanOrEqual(0); expect(game.members[0].abilities.vocal).toBe(14);
  });
  it("lists missed completed weeks in chronological order and skips existing results", () => {
    const now = new Date("2026-10-20T12:00:00+09:00"); const missed = getUnfinalizedWeeks([], now);
    expect(missed.length).toBeGreaterThan(1); expect(missed.every((week, index) => index === 0 || week.getTime() > missed[index - 1].getTime())).toBe(true);
    const skipped = getUnfinalizedWeeks([getWeekIdJst(missed[0])], now); expect(skipped.map(getWeekIdJst)).not.toContain(getWeekIdJst(missed[0]));
  });
  it("applies only the highest boost and carries integer remainders", () => {
    expect(getHighestBoost([3, 15, 10])).toBe(15);
    expect(calculateBoostedPoints(2, 5, 90)).toEqual({ basePoints: 2, boostPercent: 5, bonusPoints: 1, totalPoints: 3, remainder: 0 });
  });
  it("creates a song from a two-member snapshot and unlocks the live loop", () => {
    const game = { ...createInitialGameState(), activityPoints: 40, members: createInitialGameState().members.map((member, index) => ({ ...member, joined: index < 2 })) }; expect(canCreateSong(game)).toBe(true);
    const songGame = createSong(game, "beginning-stage", 1); expect(songGame.activityPoints).toBe(20); expect(songGame.songs[0].status).toBe("completed"); expect(songGame.songs[0].songStats.vocal).toBeGreaterThan(0);
    expect(calculateAudience(songGame, songGame.songs[0])).toBeLessThanOrEqual(30); expect(calculateFanGain(20, getLiveRating(50), songGame.songs[0])).toBeGreaterThanOrEqual(0);
  });
  it("keeps venue locked until the first live even when fans are high", () => { const game = { ...createInitialGameState(), fans: 100, activityPoints: 40, members: createInitialGameState().members.map((member, index) => ({ ...member, joined: index < 2 })) }; const completed = createSong(game); expect(isVenueUnlocked(completed, [], "mini-live-house")).toBe(false); expect(getNextGoal(completed, [])).toBe("初ライブをしよう"); });
  it("requires first live, two members, and points before recruiting the science member", () => { const base = createInitialGameState(); const two = { ...base, activityPoints: 30, members: base.members.map((member, index) => ({ ...member, joined: index < 2 })), songs: [{ ...base.songs[0], status: "completed" as const }, ...base.songs.slice(1)] }; expect(canRecruitThirdMember(two, false)).toBe(false); expect(canRecruitThirdMember({ ...two, activityPoints: 29 }, true)).toBe(false); const next = recruitThirdMember(two, true); expect(next.members[2].joined).toBe(true); expect(next.activityPoints).toBe(0); expect(recruitThirdMember(next, true)).toBe(next); });
  it("creates the dance song only after the third member and snapshots all seven abilities", () => { const base = createInitialGameState(); const ready = { ...base, activityPoints: 80, members: base.members.map((member, index) => ({ ...member, joined: index < 3 })), songs: [{ ...base.songs[0], status: "completed" as const }, { ...base.songs[1], status: "available" as const }] }; expect(canCreateSong({ ...ready, members: ready.members.map((member, index) => ({ ...member, joined: index < 2 })) }, ready.songs[1], [{} as Performance])).toBe(false); const created = createSong(ready, "kirameki-step", 1, [{} as Performance]); expect(created.songs[1].status).toBe("completed"); expect(created.activityPoints).toBe(45); expect(created.songs[1].songStats.choreography).toBeGreaterThan(0); });
  it("compares Sparkle by four categories and keeps a loss constructive", () => { const base = createInitialGameState(); const ready = { ...base, songsCompleted: 2, fans: 100, activityPoints: 80, members: base.members.map((member, index) => ({ ...member, joined: index < 3 })), songs: base.songs.map((song) => ({ ...song, status: "completed" as const, songStats: { vocal: 20, harmony: 20, dance: 20, character: 20, lyrics: 20, composition: 20, choreography: 20 } })) }; const stats = calculateBattleStats(ready, ready.songs[1]); const result = calculateRivalBattleResult(stats); expect(Object.keys(result.categoryResults)).toHaveLength(4); expect(getBattleImprovementHint(stats)).toContain("あと"); expect(canStartRivalBattle(ready, [{} as Performance])).toBe(true); expect(getRivalBattleRewards("WIN", false).fans).toBe(300); expect(getRivalBattleRewards("WIN", true).fans).toBe(0); });
  it("records the mini live house sold-out boundary only at 100 seats", () => { expect(isVenueSoldOut({ venueId: "mini-live-house", capacity: 100, audience: 99 } as Performance)).toBe(false); expect(isVenueSoldOut({ venueId: "mini-live-house", capacity: 100, audience: 100 } as Performance)).toBe(true); });
});
