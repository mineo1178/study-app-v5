import { runTransaction, type Firestore } from "firebase/firestore";
import { createInitialGameState, normalizeGameState, SONGS } from "./config";
import { createGameFirestoreRefs, type FirestoreRoot } from "./firestore-repository";
import { getFormationSnapshot } from "./leader-skills";
import { simulateMajorDebutLive } from "./major-debut";
import { ARENA_LIVES, canStartArenaLive, getArenaRewardKey, type ArenaLiveId } from "./arena-progression";
import type { Performance, ProducerGameState } from "./types";
export type ArenaReward = { rewardKey: string; type: "arena_first_clear"; fanBonus: number; activityPointBonus: number; createdAt: number };
export type ArenaCommit = { game: ProducerGameState; performance: Performance; reward: ArenaReward | null };
export type ArenaResult = ArenaCommit & { alreadyApplied: boolean };
export const simulateArenaLive = (game: ProducerGameState, liveId: ArenaLiveId, songId: string) => SONGS.some((song) => song.id === songId) ? simulateMajorDebutLive(game, songId, ARENA_LIVES[liveId]) : null;
export const prepareArenaPerformance = (game: ProducerGameState, performanceId: string, songId: string, performedAt: number, liveId: ArenaLiveId): ArenaCommit | null => {
  if (!canStartArenaLive(game, liveId) || !performanceId) return null;
  const active = game.activeMemberIds ?? [];
  if (active.length !== 4 || new Set(active).size !== active.length || !active.every((id) => game.members.some((member) => member.id === id && member.joined)) || !game.leaderMemberId || !active.includes(game.leaderMemberId)) return null;
  const simulation = simulateArenaLive(game, liveId, songId);
  if (!simulation) return null;
  const firstClear = simulation.isClear && !game.claimedTourRewardKeys?.includes(getArenaRewardKey(liveId));
  const reward = firstClear ? { rewardKey: getArenaRewardKey(liveId), type: "arena_first_clear" as const, fanBonus: ARENA_LIVES[liveId].firstClearReward.fans, activityPointBonus: ARENA_LIVES[liveId].firstClearReward.activityPoints, createdAt: performedAt } : null;
  const totalFanGain = simulation.fanGain + (reward?.fanBonus ?? 0);
  const performance: Performance = { performanceId, songId, venueId: ARENA_LIVES[liveId].venueId, performedAt, audience: simulation.audience, capacity: simulation.capacity, clearThreshold: simulation.clearThreshold, isClear: simulation.isClear, isSoldOut: simulation.isSoldOut, rating: simulation.rating, fanGain: simulation.fanGain, fanBefore: game.fans, fanAfter: game.fans + totalFanGain, version: "v1.79", formation: getFormationSnapshot(game), baseAudience: simulation.baseAudience, appliedAffinityPercent: simulation.appliedAffinityPercent, firstClearFanBonus: reward?.fanBonus ?? 0, firstClearPointBonus: reward?.activityPointBonus ?? 0 };
  return { performance, reward, game: { ...game, fans: game.fans + totalFanGain, activityPoints: game.activityPoints + (reward?.activityPointBonus ?? 0), claimedTourRewardKeys: reward ? [...(game.claimedTourRewardKeys ?? []), getArenaRewardKey(liveId)] : game.claimedTourRewardKeys ?? [], songs: game.songs.map((song) => song.id === songId ? { ...song, performanceCount: song.performanceCount + 1 } : song) } };
};

export const commitArenaPerformance = async ({ database, root, performanceId, songId, performedAt, liveId }: { database: Firestore; root: FirestoreRoot; performanceId: string; songId: string; performedAt: number; liveId: ArenaLiveId }): Promise<ArenaResult | null> => {
  const refs = createGameFirestoreRefs(root);
  return runTransaction(database, async (transaction) => {
    const performanceRef = refs.getPerformanceDoc(database, performanceId);
    const existingPerformance = await transaction.get(performanceRef);
    if (existingPerformance.exists()) return { game: normalizeGameState((await transaction.get(refs.getGameDoc(database))).data() ?? createInitialGameState()), performance: existingPerformance.data() as Performance, reward: null, alreadyApplied: true };
    const gameRef = refs.getGameDoc(database);
    const gameSnapshot = await transaction.get(gameRef);
    const current = gameSnapshot.exists() ? normalizeGameState(gameSnapshot.data()) : createInitialGameState();
    const ledgerRef = refs.getRewardLedgerDoc(database, getArenaRewardKey(liveId));
    const ledgerSnapshot = await transaction.get(ledgerRef);
    const currentWithLedger = ledgerSnapshot.exists() && !current.claimedTourRewardKeys?.includes(getArenaRewardKey(liveId)) ? { ...current, claimedTourRewardKeys: [...(current.claimedTourRewardKeys ?? []), getArenaRewardKey(liveId)] } : current;
    const prepared = prepareArenaPerformance(currentWithLedger, performanceId, songId, performedAt, liveId);
    if (!prepared) return null;
    transaction.set(performanceRef, prepared.performance);
    transaction.update(gameRef, { fans: prepared.game.fans, activityPoints: prepared.game.activityPoints, claimedTourRewardKeys: prepared.game.claimedTourRewardKeys, songs: prepared.game.songs });
    if (prepared.reward) transaction.set(ledgerRef, prepared.reward);
    return { ...prepared, alreadyApplied: false };
  });
};
