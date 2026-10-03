import { isTokyoDomeCompleted } from "./tokyo-dome-progression";
import { isArenaCompleted } from "./arena-progression";
import { runTransaction, type Firestore } from "firebase/firestore";
import { MAJOR_DEBUT_LIVE, MAJOR_DEBUT_REWARD_KEY } from "./config";
import { createInitialGameState, normalizeGameState } from "./config";
import { getActiveMembers } from "./formation";
import { createGameFirestoreRefs, type FirestoreRoot } from "./firestore-repository";
import { applyLeaderSkillToLiveFanGain, getFormationSnapshot } from "./leader-skills";
import { calculateFanGain, calculateLiveScore, getLiveRating } from "./song-live";
import { isNationalTourCompleted } from "./tour/progression";
import type { Performance, ProducerGameState } from "./types";

export type MajorDebutReward = { rewardKey: string; type: "major_debut_first_clear"; fanBonus: number; activityPointBonus: number; createdAt: number };
export type MajorDebutSimulation = { audience: number; baseAudience: number; capacity: number; clearThreshold: number; isClear: boolean; isSoldOut: boolean; rating: Performance["rating"]; fanGain: number; appliedAffinityPercent: number; selectedSongId: string };
export type MajorDebutCommit = { game: ProducerGameState; performance: Performance; reward: MajorDebutReward | null };
export type MajorDebutResult = MajorDebutCommit & { alreadyApplied: boolean };

const progress = (game: ProducerGameState) => game.tourProgress ?? { completedStopIds: [], soldOutStopIds: [], leg1Completed: false };
export const isMajorDebutChapterUnlocked = (game: ProducerGameState) => isNationalTourCompleted(progress(game));
export const isMajorDebutCompleted = (game: ProducerGameState) => game.claimedTourRewardKeys?.includes(MAJOR_DEBUT_REWARD_KEY) === true;
export const getGrowthRoadmap = (game: ProducerGameState) => { const tourComplete = isMajorDebutChapterUnlocked(game); const debutComplete = isMajorDebutCompleted(game); return { nationalTour: tourComplete ? "complete" as const : "current" as const, majorDebut: !tourComplete ? "locked" as const : debutComplete ? "complete" as const : "current" as const, arena: isArenaCompleted(game) ? "complete" as const : debutComplete ? "current" as const : "locked" as const, tokyoDome: isTokyoDomeCompleted(game) ? "complete" as const : isArenaCompleted(game) ? "next" as const : "locked" as const }; };
export const canStartMajorDebutLive = (game: ProducerGameState) => isMajorDebutChapterUnlocked(game) && game.songs.some((song) => song.id === "beyond-the-dream" && song.status === "completed") && game.fans >= MAJOR_DEBUT_LIVE.requiredFans && getActiveMembers(game).length === MAJOR_DEBUT_LIVE.requiredMembers;

export const simulateMajorDebutLive = (game: ProducerGameState, songId: string, live: { capacity: number; clearRate: number; affinities: readonly string[] } = MAJOR_DEBUT_LIVE): MajorDebutSimulation | null => {
  const song = game.songs.find((item) => item.id === songId && item.status === "completed");
  if (!song) return null;
  const liveScore = calculateLiveScore({ ...game, fans: 0 }, song);
  const affinity = live.affinities.includes(song.songType as never) ? 8 : 0;
  const baseAudience = Math.max(0, Math.round(live.capacity * Math.min(1, .55 + liveScore / 200)));
  const audience = Math.min(live.capacity, Math.round(baseAudience * (1 + affinity / 100)));
  const clearThreshold = Math.ceil(live.capacity * live.clearRate);
  const rating = getLiveRating(liveScore * (1 + affinity / 100));
  const fanGain = applyLeaderSkillToLiveFanGain(game, calculateFanGain(audience, rating, song)).finalFanGain;
  return { audience, baseAudience, capacity: live.capacity, clearThreshold, isClear: audience >= clearThreshold, isSoldOut: audience >= live.capacity, rating, fanGain, appliedAffinityPercent: affinity, selectedSongId: song.id };
};

export const prepareMajorDebutPerformance = (game: ProducerGameState, performanceId: string, songId: string, performedAt: number): MajorDebutCommit | null => {
  if (!canStartMajorDebutLive(game) || !performanceId) return null;
  const active = game.activeMemberIds ?? [];
  if (active.length !== 4 || new Set(active).size !== active.length || !active.every((id) => game.members.some((member) => member.id === id && member.joined)) || !game.leaderMemberId || !active.includes(game.leaderMemberId)) return null;
  const simulation = simulateMajorDebutLive(game, songId);
  if (!simulation) return null;
  const firstClear = simulation.isClear && !isMajorDebutCompleted(game);
  const reward = firstClear ? { rewardKey: MAJOR_DEBUT_REWARD_KEY, type: "major_debut_first_clear" as const, fanBonus: MAJOR_DEBUT_LIVE.firstClearReward.fans, activityPointBonus: MAJOR_DEBUT_LIVE.firstClearReward.activityPoints, createdAt: performedAt } : null;
  const totalFanGain = simulation.fanGain + (reward?.fanBonus ?? 0);
  const performance: Performance = { performanceId, songId, venueId: MAJOR_DEBUT_LIVE.venueId, performedAt, audience: simulation.audience, capacity: simulation.capacity, clearThreshold: simulation.clearThreshold, isClear: simulation.isClear, isSoldOut: simulation.isSoldOut, rating: simulation.rating, fanGain: simulation.fanGain, fanBefore: game.fans, fanAfter: game.fans + totalFanGain, version: "v1.79", formation: getFormationSnapshot(game), baseAudience: simulation.baseAudience, appliedAffinityPercent: simulation.appliedAffinityPercent, firstClearFanBonus: reward?.fanBonus ?? 0, firstClearPointBonus: reward?.activityPointBonus ?? 0 };
  return { performance, reward, game: { ...game, fans: game.fans + totalFanGain, activityPoints: game.activityPoints + (reward?.activityPointBonus ?? 0), claimedTourRewardKeys: reward ? [...(game.claimedTourRewardKeys ?? []), MAJOR_DEBUT_REWARD_KEY] : game.claimedTourRewardKeys ?? [], songs: game.songs.map((song) => song.id === songId ? { ...song, performanceCount: song.performanceCount + 1 } : song) } };
};

export const commitMajorDebutPerformance = async ({ database, root, performanceId, songId, performedAt }: { database: Firestore; root: FirestoreRoot; performanceId: string; songId: string; performedAt: number }): Promise<MajorDebutResult | null> => {
  const refs = createGameFirestoreRefs(root);
  return runTransaction(database, async (transaction) => {
    const performanceRef = refs.getPerformanceDoc(database, performanceId);
    const existingPerformance = await transaction.get(performanceRef);
    if (existingPerformance.exists()) return { game: normalizeGameState((await transaction.get(refs.getGameDoc(database))).data() ?? createInitialGameState()), performance: existingPerformance.data() as Performance, reward: null, alreadyApplied: true };
    const gameRef = refs.getGameDoc(database);
    const gameSnapshot = await transaction.get(gameRef);
    const current = gameSnapshot.exists() ? normalizeGameState(gameSnapshot.data()) : createInitialGameState();
    const ledgerRef = refs.getRewardLedgerDoc(database, MAJOR_DEBUT_REWARD_KEY);
    const ledgerSnapshot = await transaction.get(ledgerRef);
    const currentWithLedger = ledgerSnapshot.exists() && !isMajorDebutCompleted(current) ? { ...current, claimedTourRewardKeys: [...(current.claimedTourRewardKeys ?? []), MAJOR_DEBUT_REWARD_KEY] } : current;
    const prepared = prepareMajorDebutPerformance(currentWithLedger, performanceId, songId, performedAt);
    if (!prepared) return null;
    transaction.set(performanceRef, prepared.performance);
    transaction.set(gameRef, prepared.game);
    if (prepared.reward) transaction.set(ledgerRef, prepared.reward);
    return { ...prepared, alreadyApplied: false };
  });
};
