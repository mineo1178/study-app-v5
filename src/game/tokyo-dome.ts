import { runTransaction, type Firestore } from "firebase/firestore";
import { createInitialGameState, normalizeGameState, SONGS } from "./config";
import { createGameFirestoreRefs, type FirestoreRoot } from "./firestore-repository";
import { getFormationSnapshot } from "./leader-skills";
import { simulateMajorDebutLive } from "./major-debut";
import { TOKYO_DOME_LIVE, canStartTokyoDomeLive, TOKYO_DOME_REWARD_KEY } from "./tokyo-dome-progression";
import type { Performance, ProducerGameState } from "./types";
export type TokyoDomeReward = { rewardKey: string; type: "tokyo_dome_first_clear"; fanBonus: number; activityPointBonus: number; createdAt: number };
export type TokyoDomeCommit = { game: ProducerGameState; performance: Performance; reward: TokyoDomeReward | null };
export type TokyoDomeResult = TokyoDomeCommit & { alreadyApplied: boolean };
export const simulateTokyoDomeLive = (game: ProducerGameState, songId: string) => SONGS.some((song) => song.id === songId) ? simulateMajorDebutLive(game, songId, TOKYO_DOME_LIVE) : null;
export const prepareTokyoDomePerformance = (game: ProducerGameState, performanceId: string, songId: string, performedAt: number): TokyoDomeCommit | null => {
  if (!canStartTokyoDomeLive(game) || !performanceId) return null;
  const active = game.activeMemberIds ?? [];
  if (active.length !== 4 || new Set(active).size !== active.length || !active.every((id) => game.members.some((member) => member.id === id && member.joined)) || !game.leaderMemberId || !active.includes(game.leaderMemberId)) return null;
  const simulation = simulateTokyoDomeLive(game, songId);
  if (!simulation) return null;
  const firstClear = simulation.isClear && !game.claimedTourRewardKeys?.includes(TOKYO_DOME_REWARD_KEY);
  const reward = firstClear ? { rewardKey: TOKYO_DOME_REWARD_KEY, type: "tokyo_dome_first_clear" as const, fanBonus: TOKYO_DOME_LIVE.firstClearReward.fans, activityPointBonus: TOKYO_DOME_LIVE.firstClearReward.activityPoints, createdAt: performedAt } : null;
  const totalFanGain = simulation.fanGain + (reward?.fanBonus ?? 0);
  const performance: Performance = { performanceId, songId, venueId: TOKYO_DOME_LIVE.venueId, performedAt, audience: simulation.audience, capacity: simulation.capacity, clearThreshold: simulation.clearThreshold, isClear: simulation.isClear, isSoldOut: simulation.isSoldOut, rating: simulation.rating, fanGain: simulation.fanGain, fanBefore: game.fans, fanAfter: game.fans + totalFanGain, version: "v1.81", formation: getFormationSnapshot(game), baseAudience: simulation.baseAudience, appliedAffinityPercent: simulation.appliedAffinityPercent, firstClearFanBonus: reward?.fanBonus ?? 0, firstClearPointBonus: reward?.activityPointBonus ?? 0 };
  return { performance, reward, game: { ...game, fans: game.fans + totalFanGain, activityPoints: game.activityPoints + (reward?.activityPointBonus ?? 0), claimedTourRewardKeys: reward ? [...(game.claimedTourRewardKeys ?? []), TOKYO_DOME_REWARD_KEY] : game.claimedTourRewardKeys ?? [], songs: game.songs.map((song) => song.id === songId ? { ...song, performanceCount: song.performanceCount + 1 } : song) } };
};

export const commitTokyoDomePerformance = async ({ database, root, performanceId, songId, performedAt }: { database: Firestore; root: FirestoreRoot; performanceId: string; songId: string; performedAt: number }): Promise<TokyoDomeResult | null> => {
  const refs = createGameFirestoreRefs(root);
  return runTransaction(database, async (transaction) => {
    const performanceRef = refs.getPerformanceDoc(database, performanceId);
    const existingPerformance = await transaction.get(performanceRef);
    if (existingPerformance.exists()) return { game: normalizeGameState((await transaction.get(refs.getGameDoc(database))).data() ?? createInitialGameState()), performance: existingPerformance.data() as Performance, reward: null, alreadyApplied: true };
    const gameRef = refs.getGameDoc(database);
    const gameSnapshot = await transaction.get(gameRef);
    const current = gameSnapshot.exists() ? normalizeGameState(gameSnapshot.data()) : createInitialGameState();
    const ledgerRef = refs.getRewardLedgerDoc(database, TOKYO_DOME_REWARD_KEY);
    const ledgerSnapshot = await transaction.get(ledgerRef);
    const currentWithLedger = ledgerSnapshot.exists() && !current.claimedTourRewardKeys?.includes(TOKYO_DOME_REWARD_KEY) ? { ...current, claimedTourRewardKeys: [...(current.claimedTourRewardKeys ?? []), TOKYO_DOME_REWARD_KEY] } : current;
    const prepared = prepareTokyoDomePerformance(currentWithLedger, performanceId, songId, performedAt);
    if (!prepared) return null;
    transaction.set(performanceRef, prepared.performance);
    transaction.update(gameRef, { fans: prepared.game.fans, activityPoints: prepared.game.activityPoints, claimedTourRewardKeys: prepared.game.claimedTourRewardKeys, songs: prepared.game.songs });
    if (prepared.reward) transaction.set(ledgerRef, prepared.reward);
    return { ...prepared, alreadyApplied: false };
  });
};
