import { describe, expect, it } from "vitest";
import type { Performance } from "./types";
import { createInitialGameState, MEMBER_DEFINITIONS, normalizeGameState } from "./config";
import { applyFanChange, getMonthlyGoalHours, getMonthlyGoalMinutes, getRivalBattle, getTokyoDomeMissions, getWeeklyGoalMinutes } from "./progression";
import { canRecruitThirdMember, claimRewards, getSessionActivityPoints, getYunaRecruitmentStatus, joinNextMember, lessonMember, recruitThirdMember, recruitYuna } from "./rewards";
import { calculateBoostedPoints, getHighestBoost, getNextBonusGap, getTestBoost, testImportance } from "./test-bonus";
import { createWeeklyResult, getUnfinalizedWeeks, getWeekBoundsJst, getWeekIdJst, isFinalizableWeek } from "./weekly";
import { canCreateFourthSong, canCreateSong, calculateAudience, calculateFanGain, createSong, getLiveRating, getNextGoal, isVenueSoldOut, isVenueUnlocked, canUnlockCityHall } from "./song-live";
import { calculateBattleStats, calculateRivalBattleResult, canStartRivalBattle, getBattleImprovementHint, getRivalBattleRewards } from "./rival-battle";
import { applyLeaderSkillToBattleStats, applyLeaderSkillToLiveFanGain, getFormationSnapshot, setLeader } from "./leader-skills";
import { getActiveMembers } from "./formation";
import { applyGachaPity, applyTrainingItem, calculateDuplicateFragments, calculateWeeklyGachaReward, exchangeStarFragments, getNextTicketThreshold, grantWeeklyGachaReward, normalizeGachaDraw, normalizeGachaState, resolveGachaDraw, resolveGachaRarity, validateRateTables } from "./gacha/logic";
import { GACHA_FEATURE_START_DATE, GACHA_MEMBER_DEFINITIONS, TRAINING_ITEMS } from "./gacha/config";
import { normalizeFormation, validateFormation } from "./formation";
import { canCreateThirdSong, canUnlockRegionalHall, calculateSongLiveModifier, isRegionalHallSoldOut } from "./song-live";
import { applySongAffinityToBattleStats, canStartNovaStage1, canStartSparkleStage2, getTrainingRecommendation, simulateRivalBattle } from "./rival-battle";
import { NOVA_STAGE_1 } from "./config";
import { TOUR_LEG_1_STOPS } from "./tour/config";
import { canStartTourStop, canUnlockNationalTour, capTourAudience, getTourClearAudience, getTourStopStatus, isTourLeg1Completed, isTourStopCleared, isTourStopSoldOut } from "./tour/progression";
import { getTourAffinityPercent } from "./tour/affinity";
import { simulateTourPerformance } from "./tour/simulation";
import { getBestTourRecommendation, getTourTrainingRecommendation } from "./tour/recommendation";
import { getTourRewardKey, prepareTourPerformance } from "./tour/repository";

describe("producer game", () => {
  it("unlocks the regional hall only after two songs, Stage 1, and a 100-seat sold out", () => {
    const base = createInitialGameState(); const ready = { ...base, songsCompleted: 2, songs: base.songs.map((song, index) => ({ ...song, status: index < 2 ? "completed" as const : "available" as const })), members: base.members.map((member) => ({ ...member, joined: ["math", "japanese", "science", "yuna"].includes(member.id) })), activeMemberIds: ["math", "japanese", "science", "yuna"], wonRivalBattleIds: ["sparkle-stage-1"], milestones: { miniLiveHouseSoldOut: true } };
    expect(canUnlockRegionalHall(ready)).toBe(true); expect(canCreateThirdSong({ ...ready, activityPoints: 49 })).toBe(false); expect(canCreateThirdSong({ ...ready, activityPoints: 50 })).toBe(true);
  });
  it("caps regional hall audience and marks sold out only at 300", () => {
    const performance = { venueId: "regional-hall", capacity: 300, audience: 299 } as Performance; expect(isRegionalHallSoldOut(performance)).toBe(false); expect(isRegionalHallSoldOut({ ...performance, audience: 300 })).toBe(true); const game = { ...createInitialGameState(), fans: 999999 }; const song = { ...game.songs[0], status: "completed" as const, songStats: Object.fromEntries(Object.keys(game.members[0].abilities).map((key) => [key, 999])) as typeof game.songs[0]["songStats"] }; expect(calculateAudience(game, song, "regional-hall")).toBe(300);
  });
  it("uses small, distinct song modifiers and unlocks Stage 2 after a regional live", () => {
    const songs = createInitialGameState().songs.map((song) => ({ ...song, status: "completed" as const })); const game = { ...createInitialGameState(), songs, songsCompleted: 3, members: createInitialGameState().members.map((member) => ({ ...member, joined: ["math", "japanese", "science", "yuna"].includes(member.id) })), activeMemberIds: ["math", "japanese", "science", "yuna"], wonRivalBattleIds: ["sparkle-stage-1"], milestones: { miniLiveHouseSoldOut: true } }; expect(canStartSparkleStage2(game, [{ venueId: "regional-hall" } as Performance])).toBe(true); expect(calculateSongLiveModifier(songs[1])).toBeGreaterThan(1); expect(applySongAffinityToBattleStats({ vocal: 40, dance: 40, song: 40, character: 40 }, songs[2]).character).toBeGreaterThan(40);
  });
  it("awards Sparkle Stage 2's first win once and keeps a replay at zero", () => {
    expect(getRivalBattleRewards("WIN", false, false, 2)).toEqual({ fans: 500, points: 15, event: 1 });
    expect(getRivalBattleRewards("WIN", true, true, 2)).toEqual({ fans: 0, points: 0, event: 0 });
  });
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
  it("unlocks the next member with activity points and adds her to the active formation", () => { const game = { ...createInitialGameState(), activityPoints: 18 }; const joined = joinNextMember(game); expect(joined.members.filter((member) => member.joined)).toHaveLength(2); expect(joined.activeMemberIds).toEqual(["math", "japanese"]); });
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
    const game = { ...createInitialGameState(), activityPoints: 40, members: createInitialGameState().members.map((member, index) => ({ ...member, joined: index < 2 })), activeMemberIds: ["math", "japanese"] }; expect(canCreateSong(game)).toBe(true);
    const songGame = createSong(game, "beginning-stage", 1); expect(songGame.activityPoints).toBe(20); expect(songGame.songs[0].status).toBe("completed"); expect(songGame.songs[0].songStats.vocal).toBeGreaterThan(0);
    expect(calculateAudience(songGame, songGame.songs[0])).toBeLessThanOrEqual(30); expect(calculateFanGain(20, getLiveRating(50), songGame.songs[0])).toBeGreaterThanOrEqual(0);
  });
  it("keeps venue locked until the first live even when fans are high", () => { const game = { ...createInitialGameState(), fans: 100, activityPoints: 40, members: createInitialGameState().members.map((member, index) => ({ ...member, joined: index < 2 })), activeMemberIds: ["math", "japanese"] }; const completed = createSong(game); expect(isVenueUnlocked(completed, [], "mini-live-house")).toBe(false); expect(getNextGoal(completed, [])).toBe("初ライブをしよう"); });
  it("requires first live, two members, and points before recruiting the science member", () => { const base = createInitialGameState(); const two = { ...base, activityPoints: 30, members: base.members.map((member, index) => ({ ...member, joined: index < 2 })), activeMemberIds: ["math", "japanese"], songs: [{ ...base.songs[0], status: "completed" as const }, ...base.songs.slice(1)] }; expect(canRecruitThirdMember(two, false)).toBe(false); expect(canRecruitThirdMember({ ...two, activityPoints: 29 }, true)).toBe(false); const next = recruitThirdMember(two, true); expect(next.members[2].joined).toBe(true); expect(next.activeMemberIds).toEqual(["math", "japanese", "science"]); expect(next.activityPoints).toBe(0); expect(recruitThirdMember(next, true)).toBe(next); });
  it("creates the dance song only after the third member and snapshots all seven abilities", () => { const base = createInitialGameState(); const ready = { ...base, activityPoints: 80, members: base.members.map((member, index) => ({ ...member, joined: index < 3 })), activeMemberIds: ["math", "japanese", "science"], songs: [{ ...base.songs[0], status: "completed" as const }, { ...base.songs[1], status: "available" as const }] }; expect(canCreateSong({ ...ready, members: ready.members.map((member, index) => ({ ...member, joined: index < 2 })), activeMemberIds: ["math", "japanese"] }, ready.songs[1], [{} as Performance])).toBe(false); const created = createSong(ready, "kirameki-step", 1, [{} as Performance]); expect(created.songs[1].status).toBe("completed"); expect(created.activityPoints).toBe(45); expect(created.songs[1].songStats.choreography).toBeGreaterThan(0); });
  it("compares Sparkle by four categories and keeps a loss constructive", () => { const base = createInitialGameState(); const ready = { ...base, songsCompleted: 2, fans: 100, activityPoints: 80, members: base.members.map((member, index) => ({ ...member, joined: index < 3 })), activeMemberIds: ["math", "japanese", "science"], songs: base.songs.map((song) => ({ ...song, status: "completed" as const, songStats: { vocal: 20, harmony: 20, dance: 20, character: 20, lyrics: 20, composition: 20, choreography: 20 } })) }; const stats = calculateBattleStats(ready, ready.songs[1]); const result = calculateRivalBattleResult(stats); expect(Object.keys(result.categoryResults)).toHaveLength(4); expect(getBattleImprovementHint(stats)).toContain("あと"); expect(canStartRivalBattle(ready, [{} as Performance])).toBe(true); expect(getRivalBattleRewards("WIN", false).fans).toBe(300); expect(getRivalBattleRewards("WIN", true).fans).toBe(0); });
  it("records the mini live house sold-out boundary only at 100 seats", () => { expect(isVenueSoldOut({ venueId: "mini-live-house", capacity: 100, audience: 99 } as Performance)).toBe(false); expect(isVenueSoldOut({ venueId: "mini-live-house", capacity: 100, audience: 100 } as Performance)).toBe(true); });
  it("migrates legacy game data to an active formation and valid leader without overwriting its saved progress", () => {
    const initial = createInitialGameState(); const legacy = { ...initial, activityPoints: 77, members: initial.members.map((member, index) => ({ ...member, joined: index < 3 })), activeMemberIds: undefined, leaderMemberId: undefined };
    const migrated = normalizeGameState(legacy); expect(migrated.activityPoints).toBe(77); expect(migrated.activeMemberIds).toEqual(["math", "japanese", "science"]); expect(migrated.leaderMemberId).toBe("math");
    expect(normalizeGameState({ ...legacy, activeMemberIds: ["math", "missing"], leaderMemberId: "missing" }).leaderMemberId).toBe("math");
  });
  it("requires every Yuna condition, charges 45P once, and makes her the fourth active member", () => {
    const base = createInitialGameState(); expect(getYunaRecruitmentStatus(base).canRecruit).toBe(false);
    const ready = { ...base, activityPoints: 45, members: base.members.map((member) => ({ ...member, joined: ["math", "japanese", "science"].includes(member.id) })), activeMemberIds: ["math", "japanese", "science"], songs: base.songs.map((song, index) => ({ ...song, status: index < 2 ? "completed" as const : song.status })), wonRivalBattleIds: ["sparkle-stage-1"], milestones: { miniLiveHouseSoldOut: true } };
    expect(getYunaRecruitmentStatus({ ...ready, activityPoints: 44 }).canRecruit).toBe(false); const joined = recruitYuna(ready, 123); expect(joined.activityPoints).toBe(0); expect(joined.members.find((member) => member.id === "yuna")?.joinedAt).toBe(123); expect(joined.activeMemberIds).toEqual(["math", "japanese", "science", "yuna"]); expect(recruitYuna(joined, 124)).toBe(joined);
  });
  it("limits leader selection to active members and applies each leader effect only in its intended activity", () => {
    const base = createInitialGameState(); const game = { ...base, members: base.members.map((member) => ({ ...member, joined: ["math", "japanese", "science", "yuna"].includes(member.id) })), activeMemberIds: ["math", "japanese", "science", "yuna"] };
    const rinaLeader = setLeader(game, "science"); expect(setLeader(rinaLeader, "social")).toBe(rinaLeader); expect(applyLeaderSkillToBattleStats(rinaLeader, { vocal: 20, dance: 20, song: 20, character: 20 })).toEqual({ vocal: 20, dance: 22, song: 20, character: 20 });
    const yunaLeader = setLeader(game, "yuna"); expect(applyLeaderSkillToLiveFanGain(yunaLeader, 39)).toMatchObject({ baseFanGain: 39, bonusFanGain: 3, finalFanGain: 42, skillId: "fan-maker" }); expect(getFormationSnapshot(yunaLeader)).toEqual({ activeMemberIds: ["math", "japanese", "science", "yuna"], leaderMemberId: "yuna", leaderSkillId: "fan-maker" });
  });
  it("uses only the selected four members for live and battle calculations", () => {
    const base = createInitialGameState(); const withLegacyMember = { ...base, members: base.members.map((member) => ({ ...member, joined: true })), activeMemberIds: ["math", "japanese", "science", "yuna"] };
    expect(getActiveMembers(withLegacyMember).map((member) => member.id)).toEqual(["math", "japanese", "science", "yuna"]);
    expect(calculateBattleStats(withLegacyMember, withLegacyMember.songs[0]).character).toBeLessThan(20);
  });
  it("maps each completed weekly achievement band to one capped ticket reward", () => {
    const end = GACHA_FEATURE_START_DATE; expect([.49, .5, .69, .7, .89, .9, .99, 1, 1.19, 1.2, 1.5].map((rate) => calculateWeeklyGachaReward(rate, end))).toEqual([null, { ticketType: "normal", quantity: 1 }, { ticketType: "normal", quantity: 1 }, { ticketType: "normal", quantity: 2 }, { ticketType: "normal", quantity: 2 }, { ticketType: "silver", quantity: 1 }, { ticketType: "silver", quantity: 1 }, { ticketType: "gold", quantity: 1 }, { ticketType: "gold", quantity: 1 }, { ticketType: "premium", quantity: 1 }, { ticketType: "premium", quantity: 1 }]); expect(calculateWeeklyGachaReward(2, GACHA_FEATURE_START_DATE - 1)).toBeNull(); expect(getNextTicketThreshold(120, 100).nextPercent).toBeNull();
  });
  it("keeps rate tables at 100 percent and resolves ticket rarity boundaries without Math.random", () => {
    expect(validateRateTables()).toBe(true); expect(resolveGachaRarity("normal", { drawsSinceSrPlus: 0, drawsSinceSsr: 0 }, .749).rarity).toBe("N"); expect(resolveGachaRarity("normal", { drawsSinceSrPlus: 0, drawsSinceSsr: 0 }, .75).rarity).toBe("R"); expect(resolveGachaRarity("normal", { drawsSinceSrPlus: 0, drawsSinceSsr: 0 }, .999).rarity).toBe("SR"); expect(resolveGachaRarity("premium", { drawsSinceSrPlus: 0, drawsSinceSsr: 0 }, 0).rarity).toBe("R");
  });
  it("applies SR and SSR pity with SSR priority and resets counters correctly", () => {
    expect(resolveGachaRarity("normal", { drawsSinceSrPlus: 9, drawsSinceSsr: 19 }, 0).rarity).toBe("SSR"); expect(resolveGachaRarity("normal", { drawsSinceSrPlus: 9, drawsSinceSsr: 0 }, 0).rarity).toBe("SR"); const base = normalizeGachaState(); expect(applyGachaPity({ ...base, drawsSinceSrPlus: 9, drawsSinceSsr: 19 }, "SSR")).toMatchObject({ drawsSinceSrPlus: 0, drawsSinceSsr: 0 }); expect(applyGachaPity(base, "SR")).toMatchObject({ drawsSinceSrPlus: 0, drawsSinceSsr: 1 }); expect(applyGachaPity(base, "R")).toMatchObject({ drawsSinceSrPlus: 1, drawsSinceSsr: 1 });
  });
  it("adds a new member once and changes duplicate draws into fragments", () => {
    const game = createInitialGameState(); const state = grantWeeklyGachaReward(normalizeGachaState(), { ticketType: "normal", quantity: 2 }); const first = resolveGachaDraw(game, state, "d1", "normal", { rarityRoll: .8, categoryRoll: 0, poolRoll: 0 }, 1)!; expect(first.draw.memberId).toBe("aoi-r"); expect(first.game.members.some((member) => member.id === "aoi-r")).toBe(true); const second = resolveGachaDraw(first.game, first.gacha, "d2", "normal", { rarityRoll: .8, categoryRoll: 0, poolRoll: 0 }, 2)!; expect(second.draw.duplicate).toBe(true); expect(second.gacha.starFragments).toBe(10); expect(second.game.members.filter((member) => member.id === "aoi-r")).toHaveLength(1); expect(calculateDuplicateFragments("SR")).toBe(30); expect(calculateDuplicateFragments("SSR")).toBe(100);
  });
  it("uses an item exactly once and preserves other abilities", () => {
    const game = createInitialGameState(); const state = { ...normalizeGachaState(), itemInventory: { "vocal-n": 1 } }; const result = applyTrainingItem(game, state, "vocal-n", "math", "use-1")!; expect(result.game.members[0].abilities.vocal).toBe(game.members[0].abilities.vocal + 1); expect(result.game.members[0].abilities.dance).toBe(game.members[0].abilities.dance); expect(result.gacha.itemInventory["vocal-n"]).toBe(0); expect(applyTrainingItem(result.game, result.gacha, "vocal-n", "math", "use-1")).toBeNull(); expect(applyTrainingItem(game, state, "vocal-n", "missing")).toBeNull();
  });
  it("validates four-member selection and leader fallback while retaining the starter milestone", () => {
    const base = createInitialGameState(); const members = [...base.members.filter((member) => ["math", "japanese", "science", "yuna"].includes(member.id)).map((member) => ({ ...member, joined: true })), { id: "aoi-r", name: "アオイ", specialty: "", joined: true, abilities: { ...GACHA_MEMBER_DEFINITIONS[0].baseStats } }]; const game = { ...base, members, activeMemberIds: ["math", "japanese", "science", "yuna"], leaderMemberId: "math" }; expect(validateFormation(game, ["math", "japanese", "science", "yuna"])).toBe(true); expect(validateFormation(game, ["math", "japanese", "science", "yuna", "aoi-r"])).toBe(false); expect(validateFormation(game, ["math", "math"])).toBe(false); expect(normalizeFormation(game, ["aoi-r", "japanese", "science", "yuna"], "math").leaderMemberId).toBe("aoi-r"); expect(getTokyoDomeMissions({ ...game, milestones: { starterGroupCompleted: true } })[0].done).toBe(true);
  });
  it("uses gacha leader rarity bonuses without making SSR mandatory", () => {
    const definition = GACHA_MEMBER_DEFINITIONS.find((member) => member.id === "sena-ssr")!; const base = createInitialGameState(); const game = { ...base, members: [...base.members, { id: definition.id, name: definition.name, specialty: "", joined: true, abilities: definition.baseStats }], activeMemberIds: ["math", definition.id], leaderMemberId: definition.id }; expect(applyLeaderSkillToBattleStats(game, { vocal: 20, dance: 20, song: 20, character: 20 }).vocal).toBe(23);
  });
  it("applies every rarity item bonus and does not permit a zero-quantity use", () => {
    const game = createInitialGameState(); for (const [rarity, bonus] of [["N", 1], ["R", 2], ["SR", 3], ["SSR", 5]] as const) { const item = TRAINING_ITEMS.find((candidate) => candidate.ability === "vocal" && candidate.rarity === rarity)!; const result = applyTrainingItem(game, { ...normalizeGachaState(), itemInventory: { [item.id]: 1 } }, item.id, "math")!; expect(result.game.members[0].abilities.vocal).toBe(game.members[0].abilities.vocal + bonus); } expect(applyTrainingItem(game, normalizeGachaState(), "vocal-n", "math")).toBeNull();
  });
  it("uses the configured exchange prices, validates the selected stat, and applies an exchange id once", () => {
    const gold = exchangeStarFragments(normalizeGachaState({ starFragments: 200 }), "gold-ticket", "exchange-1")!;
    expect(gold.gacha.starFragments).toBe(50); expect(gold.gacha.ticketBalances.gold).toBe(1); expect(gold.exchange.exchangeId).toBe("exchange-1"); const replay = exchangeStarFragments(gold.gacha, "gold-ticket", "exchange-1", undefined, 2, gold.exchange)!; expect(replay.gacha).toBe(gold.gacha); expect(replay.gacha.ticketBalances.gold).toBe(1);
    expect(exchangeStarFragments(normalizeGachaState({ starFragments: 24 }), "dance-item-r", "no", "dance")).toBeNull(); expect(exchangeStarFragments(normalizeGachaState({ starFragments: 25 }), "dance-item-r", "r", "dance")?.gacha.itemInventory["dance-r"]).toBe(1); expect(exchangeStarFragments(normalizeGachaState({ starFragments: 60 }), "dance-item-sr", "sr", "dance")?.gacha.itemInventory["dance-sr"]).toBe(1);
    expect(exchangeStarFragments(normalizeGachaState({ starFragments: 80 }), "silver-ticket", "silver")?.gacha.ticketBalances.silver).toBe(1); expect(exchangeStarFragments(normalizeGachaState({ starFragments: 350 }), "premium-ticket", "premium")?.gacha.ticketBalances.premium).toBe(1); expect(exchangeStarFragments(normalizeGachaState({ starFragments: 25 }), "dance-item-r", "bad", "vocal")).toBeNull();
  });
  it("keeps a sixteen-member collection with starter and gacha rarity definitions", () => {
    expect(MEMBER_DEFINITIONS).toHaveLength(16); expect(MEMBER_DEFINITIONS.filter((member) => member.sourceType === "starter")).toHaveLength(4); expect(MEMBER_DEFINITIONS.filter((member) => member.rarity === "R")).toHaveLength(4); expect(MEMBER_DEFINITIONS.filter((member) => member.rarity === "SR")).toHaveLength(4); expect(MEMBER_DEFINITIONS.filter((member) => member.rarity === "SSR")).toHaveLength(4);
  });
  it("normalizes older gacha draw records without new optional fields", () => {
    expect(normalizeGachaDraw({ drawId: "legacy", memberId: "aoi-r" })).toMatchObject({ ticketType: "normal", rarity: "N", resultType: "member", duplicate: false, starFragmentsGained: 0, pityApplied: "none", drawnAt: 0 });
  });
  it("defines three Tour Leg 1 stops entirely in config", () => {
    expect(TOUR_LEG_1_STOPS.map((stop) => stop.id)).toEqual(["tour-stop-1", "tour-stop-2", "tour-stop-3"]); expect(TOUR_LEG_1_STOPS.map((stop) => stop.capacity)).toEqual([1200, 1800, 2500]); expect(TOUR_LEG_1_STOPS.every((stop) => stop.clearRate === .75)).toBe(true); expect(TOUR_LEG_1_STOPS.map((stop) => stop.firstClearReward)).toEqual([{ fans: 300, activityPoints: 10 }, { fans: 450, activityPoints: 12 }, { fans: 600, activityPoints: 15 }]); expect(TOUR_LEG_1_STOPS.map((stop) => stop.affinities)).toEqual([["VOCAL", "HARMONY"], ["DANCE"], ["PERFORMANCE", "CHARACTER"]]);
  });
  it("normalizes missing and malformed Tour progress without writing data", () => {
    const legacy = normalizeGameState({}); expect(legacy.tourProgress).toEqual({ completedStopIds: [], soldOutStopIds: [], leg1Completed: false });
    const normalized = normalizeGameState({ tourProgress: { completedStopIds: ["tour-stop-1", "tour-stop-1", "tour-stop-999"] as never[], soldOutStopIds: ["tour-stop-2", "tour-stop-2", "unknown"] as never[], leg1Completed: true } }); expect(normalized.tourProgress).toEqual({ completedStopIds: ["tour-stop-1", "tour-stop-2"], soldOutStopIds: ["tour-stop-2"], leg1Completed: true });
  });
  it("unlocks the national tour only with city hall, four songs, NOVA, and both major rivals", () => {
    const base = createInitialGameState(); const ready = { ...base, songs: base.songs.map((song) => ({ ...song, status: "completed" as const })), milestones: { cityHallSoldOut: true }, wonRivalBattleIds: ["sparkle-stage-1", "sparkle-stage-2", "nova-stage-1"] };
    expect(canUnlockNationalTour({ ...ready, milestones: {} })).toBe(false); expect(canUnlockNationalTour({ ...ready, wonRivalBattleIds: ["sparkle-stage-1"] })).toBe(false); expect(canUnlockNationalTour({ ...ready, songs: ready.songs.slice(0, 3) })).toBe(false); expect(canUnlockNationalTour({ ...ready, wonRivalBattleIds: ["sparkle-stage-1", "sparkle-stage-2"] })).toBe(false); expect(canUnlockNationalTour(ready)).toBe(true);
  });
  it("derives ordered Tour stop status and permits replays without skip", () => {
    const base = createInitialGameState(); const game = { ...base, songs: base.songs.map((song) => ({ ...song, status: "completed" as const })), milestones: { cityHallSoldOut: true }, wonRivalBattleIds: ["sparkle-stage-1", "nova-stage-1"] };
    expect(TOUR_LEG_1_STOPS.map((stop) => getTourStopStatus(base, stop.id))).toEqual(["locked", "locked", "locked"]); expect(TOUR_LEG_1_STOPS.map((stop) => getTourStopStatus(game, stop.id))).toEqual(["open", "locked", "locked"]); expect(canStartTourStop(game, "tour-stop-2")).toBe(false);
    const clear1 = { ...game, tourProgress: { completedStopIds: ["tour-stop-1" as const], soldOutStopIds: [], leg1Completed: false } }; expect(getTourStopStatus(clear1, "tour-stop-1")).toBe("clear"); expect(canStartTourStop(clear1, "tour-stop-1")).toBe(true); expect(getTourStopStatus(clear1, "tour-stop-2")).toBe("open");
    const sold1 = { ...clear1, tourProgress: { completedStopIds: ["tour-stop-1" as const], soldOutStopIds: ["tour-stop-1" as const], leg1Completed: false } }; expect(getTourStopStatus(sold1, "tour-stop-1")).toBe("sold-out"); expect(canStartTourStop(sold1, "tour-stop-1")).toBe(true); const clear2 = { ...clear1, tourProgress: { completedStopIds: ["tour-stop-1", "tour-stop-2"] as ("tour-stop-1" | "tour-stop-2")[], soldOutStopIds: [], leg1Completed: false } }; expect(getTourStopStatus(clear2, "tour-stop-3")).toBe("open");
  });
  it("uses configured clear thresholds, sold-out boundaries, and safe audience caps", () => {
    const [one, two, three] = TOUR_LEG_1_STOPS; expect([one, two, three].map(getTourClearAudience)).toEqual([900, 1350, 1875]); expect(isTourStopCleared(one, 899)).toBe(false); expect(isTourStopCleared(one, 900)).toBe(true); expect(isTourStopCleared(two, 1349)).toBe(false); expect(isTourStopCleared(two, 1350)).toBe(true); expect(isTourStopCleared(three, 1874)).toBe(false); expect(isTourStopCleared(three, 1875)).toBe(true); expect(isTourStopSoldOut(one, 1199)).toBe(false); expect(isTourStopSoldOut(one, 1200)).toBe(true); expect(isTourStopSoldOut(two, 1800)).toBe(true); expect(isTourStopSoldOut(three, 2500)).toBe(true); expect([capTourAudience(one, -1), capTourAudience(one, 1199), capTourAudience(one, 1201), capTourAudience(two, 1801), capTourAudience(three, 2501)]).toEqual([0, 1199, 1200, 1800, 2500]);
  });
  it("completes only Tour Leg 1 when every stop is clear or sold out", () => {
    expect(isTourLeg1Completed({ completedStopIds: [], soldOutStopIds: [], leg1Completed: false })).toBe(false); expect(isTourLeg1Completed({ completedStopIds: ["tour-stop-1", "tour-stop-2", "tour-stop-3"], soldOutStopIds: [], leg1Completed: false })).toBe(true); expect(isTourLeg1Completed({ completedStopIds: ["tour-stop-1", "tour-stop-2"], soldOutStopIds: ["tour-stop-3"], leg1Completed: false })).toBe(true);
  });
  it("simulates Tour performances from active current stats, song snapshots, affinity, and live-only Leader effects", () => {
    const base = createInitialGameState(); const game = { ...base, members: base.members.map((member, index) => ({ ...member, joined: index < 4 || member.id === "yuna", abilities: { ...member.abilities, vocal: 5, harmony: 5, dance: 5, character: 5, lyrics: 5, composition: 5, choreography: 5 } })), activeMemberIds: ["math", "japanese", "science", "yuna"], leaderMemberId: "yuna", songs: base.songs.map((song) => ({ ...song, status: "completed" as const, songStats: { vocal: 5, harmony: 5, dance: 5, character: 5, lyrics: 5, composition: 5, choreography: 5 } })) };
    const vocal = simulateTourPerformance(game, "tour-stop-1", "beginning-stage")!; const dance = simulateTourPerformance(game, "tour-stop-1", "kirameki-step")!; expect(vocal.capacity).toBe(1200); expect(vocal.clearThreshold).toBe(900); expect(vocal.appliedAffinityPercent).toBe(8); expect(dance.appliedAffinityPercent).toBe(0); expect(vocal.activeMemberIds).toEqual(["math", "japanese", "science", "yuna"]); expect(vocal.fanGain).toBeGreaterThan(0); expect(getTourAffinityPercent(TOUR_LEG_1_STOPS[1], game.songs[1])).toBe(8); expect(getTourAffinityPercent(TOUR_LEG_1_STOPS[2], game.songs[2])).toBe(8);
    const inactiveChanged = { ...game, members: [...game.members, { id: "extra", name: "Extra", specialty: "", joined: true, abilities: { vocal: 999, harmony: 999, dance: 999, character: 999, lyrics: 999, composition: 999, choreography: 999 } }] }; expect(simulateTourPerformance(inactiveChanged, "tour-stop-1", "beginning-stage")!.audience).toBe(vocal.audience); const swapped = { ...inactiveChanged, activeMemberIds: ["math", "japanese", "science", "extra"] }; expect(simulateTourPerformance(swapped, "tour-stop-1", "beginning-stage")!.audience).toBeGreaterThan(vocal.audience); expect(simulateTourPerformance(game, "tour-stop-1", "beginning-stage")).toEqual(vocal);
  });
  it("keeps Tour recommendations pure and returns training only when a stop is not clear", () => {
    const base = createInitialGameState(); const game = { ...base, members: base.members.map((member, index) => ({ ...member, joined: index < 4 || member.id === "yuna", abilities: { vocal: 1, harmony: 1, dance: 1, character: 1, lyrics: 1, composition: 1, choreography: 1 } })), activeMemberIds: ["math", "japanese", "science", "yuna"], songs: base.songs.map((song) => ({ ...song, status: "completed" as const, songStats: { vocal: 0, harmony: 0, dance: 0, character: 0, lyrics: 0, composition: 0, choreography: 0 } })) }; const before = JSON.stringify(game); const training = getTourTrainingRecommendation(game, "tour-stop-2", "kirameki-step"); expect(training?.targetId).toBe("dance-choreography"); expect(getBestTourRecommendation(game, "tour-stop-2", "kirameki-step")).toBeTruthy(); expect(JSON.stringify(game)).toBe(before);
  });
  it("prepares Tour snapshots, stable first-clear rewards, sold-out progress, and Leg 1 completion", () => {
    const base = createInitialGameState(); const game = { ...base, fans: 100, activityPoints: 0, members: base.members.map((member, index) => ({ ...member, joined: index < 4 || member.id === "yuna", abilities: { vocal: 80, harmony: 80, dance: 80, character: 80, lyrics: 80, composition: 80, choreography: 80 } })), activeMemberIds: ["math", "japanese", "science", "yuna"], leaderMemberId: "math", songs: base.songs.map((song) => ({ ...song, status: "completed" as const, songStats: { vocal: 80, harmony: 80, dance: 80, character: 80, lyrics: 80, composition: 80, choreography: 80 } })), milestones: { cityHallSoldOut: true }, wonRivalBattleIds: ["sparkle-stage-1", "nova-stage-1"] };
    const one = prepareTourPerformance(game, "tour-a", "tour-stop-1", "beginning-stage", 1)!; expect(one.performance).toMatchObject({ mode: "tour", tourId: "national-tour-1", tourStopId: "tour-stop-1", capacity: 1200, isClear: true, isSoldOut: true, formation: { activeMemberIds: ["math", "japanese", "science", "yuna"], leaderMemberId: "math" } }); expect(one.reward).toMatchObject({ rewardKey: "tour-leg1-stop1-first-clear", fanBonus: 300, activityPointBonus: 10 });
    const replay = prepareTourPerformance(one.game, "tour-b", "tour-stop-1", "beginning-stage", 2)!; expect(replay.reward).toBeNull(); expect(replay.game.fans).toBe(one.game.fans + replay.performance.fanGain); expect(replay.game.tourProgress?.soldOutStopIds).toContain("tour-stop-1");
    const two = prepareTourPerformance(one.game, "tour-c", "tour-stop-2", "kirameki-step", 3)!; const three = prepareTourPerformance(two.game, "tour-d", "tour-stop-3", "colorful-memory", 4)!; expect(two.reward).toMatchObject({ rewardKey: "tour-leg1-stop2-first-clear", fanBonus: 450, activityPointBonus: 12 }); expect(three.reward).toMatchObject({ rewardKey: "tour-leg1-stop3-first-clear", fanBonus: 600, activityPointBonus: 15 }); expect(three.game.tourProgress?.leg1Completed).toBe(true); expect(prepareTourPerformance(three.game, "tour-e", "tour-stop-3", "colorful-memory", 5)?.game.tourProgress?.leg1Completed).toBe(true);
    expect(["tour-stop-1", "tour-stop-2", "tour-stop-3"].map((id) => getTourRewardKey(id as "tour-stop-1"))).toEqual(["tour-leg1-stop1-first-clear", "tour-leg1-stop2-first-clear", "tour-leg1-stop3-first-clear"]); expect(prepareTourPerformance(game, "locked", "tour-stop-2", "kirameki-step", 1)).toBeNull(); expect(prepareTourPerformance({ ...game, songs: game.songs.map((song, index) => index === 0 ? { ...song, status: "available" as const } : song) }, "song", "tour-stop-1", "beginning-stage", 1)).toBeNull(); expect(prepareTourPerformance({ ...game, activeMemberIds: ["missing"], leaderMemberId: "missing" }, "formation", "tour-stop-1", "beginning-stage", 1)).toBeNull(); expect(prepareTourPerformance({ ...game, leaderMemberId: "missing" }, "leader", "tour-stop-1", "beginning-stage", 1)).toBeNull();
  });
  it("unlocks the 800-seat city hall only after regional sold out, Sparkle 2, and three songs", () => {
    const base = createInitialGameState(); const ready = { ...base, songsCompleted: 3, songs: base.songs.map((song, index) => ({ ...song, status: index < 3 ? "completed" as const : "available" as const })), wonRivalBattleIds: ["sparkle-stage-2"], milestones: { regionalHallSoldOut: true } };
    expect(canUnlockCityHall({ ...ready, milestones: {} })).toBe(false); expect(canUnlockCityHall({ ...ready, wonRivalBattleIds: [] })).toBe(false); expect(canUnlockCityHall({ ...ready, songs: ready.songs.map((song, index) => ({ ...song, status: index < 2 ? "completed" as const : "available" as const })) })).toBe(false); expect(canUnlockCityHall(ready)).toBe(true);
  });
  it("requires 65P for the fourth song and keeps its stat snapshot fixed", () => {
    const base = createInitialGameState(); const ready = { ...base, activityPoints: 65, songsCompleted: 3, members: base.members.map((member) => ({ ...member, joined: ["math", "japanese", "science", "yuna"].includes(member.id) })), activeMemberIds: ["math", "japanese", "science", "yuna"], songs: base.songs.map((song, index) => ({ ...song, status: index < 3 ? "completed" as const : index === 3 ? "available" as const : song.status })), wonRivalBattleIds: ["sparkle-stage-2"], milestones: { regionalHallSoldOut: true } };
    expect(canCreateFourthSong({ ...ready, activityPoints: 64 })).toBe(false); expect(canCreateFourthSong(ready)).toBe(true); const created = createSong(ready, "tsunagaru-melody"); expect(created.activityPoints).toBe(0); expect(created.songs[3].status).toBe("completed"); expect(createSong(created, "tsunagaru-melody")).toBe(created);
  });
  it("caps city-hall attendance and preserves the sold-out boundary", () => {
    expect(isVenueSoldOut({ venueId: "city-hall", capacity: 800, audience: 799 } as Performance)).toBe(false); expect(isVenueSoldOut({ venueId: "city-hall", capacity: 800, audience: 800 } as Performance)).toBe(true); const game = { ...createInitialGameState(), fans: 999999 }; const song = { ...game.songs[0], status: "completed" as const, songStats: Object.fromEntries(Object.keys(game.members[0].abilities).map((key) => [key, 999])) as typeof game.songs[0]["songStats"] }; expect(calculateAudience(game, song, "city-hall")).toBe(800);
  });
  it("unlocks NOVA only after city live and supports a three-win starter strategy", () => {
    const base = createInitialGameState(); const ready = { ...base, songsCompleted: 4, members: base.members.filter((member) => ["math", "japanese", "science", "yuna"].includes(member.id)).map((member) => ({ ...member, joined: true, abilities: { ...member.abilities, vocal: 28, harmony: 28, lyrics: 30, composition: 30, character: 30 } })), activeMemberIds: ["math", "japanese", "science", "yuna"], leaderMemberId: "japanese", songs: base.songs.map((song) => ({ ...song, status: "completed" as const, songStats: { vocal: 25, harmony: 25, dance: 10, character: 25, lyrics: 25, composition: 25, choreography: 10 } })), wonRivalBattleIds: ["sparkle-stage-2"], milestones: { regionalHallSoldOut: true } };
    expect(canStartNovaStage1(ready, [])).toBe(false); expect(canStartNovaStage1(ready, [{ venueId: "city-hall" } as Performance])).toBe(true); const result = simulateRivalBattle(ready, ready.songs[3]); expect(result.categoryResults.dance).toBe("LOSE"); expect(["WIN", "PERFECT WIN"]).toContain(result.overallResult); expect(NOVA_STAGE_1.stats).toEqual({ vocal: 49, dance: 58, song: 48, character: 54 }); expect(getTrainingRecommendation({ vocal: 40, dance: 60, song: 60, character: 60 })).toContain("歌唱");
  });
});
