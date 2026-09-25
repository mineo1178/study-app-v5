import { getFormationSnapshot } from "../leader-skills";
import { createInitialGameState, normalizeGameState } from "../config";
import { createGameFirestoreRefs, type FirestoreRoot } from "../firestore-repository";
import type { Performance, ProducerGameState } from "../types";
import { runTransaction, type Firestore } from "firebase/firestore";
import { NATIONAL_TOUR_ID, TOUR_LEG_1_STOPS } from "./config";
import { canStartTourStop, canUnlockNationalTour, isTourLeg1Completed } from "./progression";
import { simulateTourPerformance } from "./simulation";
import type { TourStopId } from "./types";

export type TourRewardLedgerEntry = { rewardKey: string; type: "tour_first_clear"; tourStopId: TourStopId; fanBonus: number; activityPointBonus: number; createdAt: number };
export type TourCommit = { game: ProducerGameState; performance: Performance; reward: TourRewardLedgerEntry | null };
export const getTourRewardKey = (id: TourStopId) => `tour-leg1-${id.replace("tour-stop-", "stop")}-first-clear`;
export const prepareTourPerformance = (game: ProducerGameState, performanceId: string, tourStopId: TourStopId, songId: string, performedAt: number): TourCommit | null => {
  if (!canUnlockNationalTour(game) || !canStartTourStop(game, tourStopId) || !performanceId) return null;
  const active = game.activeMemberIds ?? []; if (active.length === 0 || active.length > 4 || new Set(active).size !== active.length || !active.every((id) => game.members.some((member) => member.id === id && member.joined)) || !game.leaderMemberId || !active.includes(game.leaderMemberId)) return null;
  const simulation = simulateTourPerformance(game, tourStopId, songId); if (!simulation) return null;
  const stop = TOUR_LEG_1_STOPS.find((item) => item.id === tourStopId)!; const key = getTourRewardKey(tourStopId); const firstClear = simulation.isClear && !game.claimedTourRewardKeys?.includes(key); const reward = firstClear ? { rewardKey: key, type: "tour_first_clear" as const, tourStopId, fanBonus: stop.firstClearReward.fans, activityPointBonus: stop.firstClearReward.activityPoints, createdAt: performedAt } : null;
  const completedStopIds = simulation.isClear ? Array.from(new Set([...(game.tourProgress?.completedStopIds ?? []), tourStopId])) : game.tourProgress?.completedStopIds ?? []; const soldOutStopIds = simulation.isSoldOut ? Array.from(new Set([...(game.tourProgress?.soldOutStopIds ?? []), tourStopId])) : game.tourProgress?.soldOutStopIds ?? []; const progress = { completedStopIds: Array.from(new Set([...completedStopIds, ...soldOutStopIds])), soldOutStopIds, leg1Completed: game.tourProgress?.leg1Completed === true || isTourLeg1Completed({ completedStopIds, soldOutStopIds, leg1Completed: false }) };
  const totalFanGain = simulation.fanGain + (reward?.fanBonus ?? 0); const performance: Performance = { performanceId, mode: "tour", tourId: NATIONAL_TOUR_ID, tourStopId, venueId: tourStopId, songId, performedAt, audience: simulation.audience, capacity: simulation.capacity, clearThreshold: simulation.clearThreshold, isClear: simulation.isClear, isSoldOut: simulation.isSoldOut, rating: simulation.rating, fanGain: simulation.fanGain, fanBefore: game.fans, fanAfter: game.fans + totalFanGain, version: "v1.76", formation: getFormationSnapshot(game), baseAudience: simulation.baseAudience, appliedAffinityPercent: simulation.appliedAffinityPercent, firstClearFanBonus: reward?.fanBonus ?? 0, firstClearPointBonus: reward?.activityPointBonus ?? 0 };
  return { performance, reward, game: { ...game, fans: game.fans + totalFanGain, activityPoints: game.activityPoints + (reward?.activityPointBonus ?? 0), tourProgress: progress, claimedTourRewardKeys: reward ? [...(game.claimedTourRewardKeys ?? []), key] : game.claimedTourRewardKeys ?? [] } };
};

export type TourPerformanceRequest = { database: Firestore; root: FirestoreRoot; performanceId: string; tourStopId: TourStopId; songId: string; performedAt: number };
export type TourPerformanceResult = TourCommit & { alreadyApplied: boolean };

/**
 * Persists one Tour performance atomically in the existing game, performance,
 * and rewardLedger collections. A repeated performanceId is a no-op.
 */
export const commitTourPerformance = async (request: TourPerformanceRequest): Promise<TourPerformanceResult | null> => {
  const refs = createGameFirestoreRefs(request.root);
  return runTransaction(request.database, async (transaction) => {
    const performanceRef = refs.getPerformanceDoc(request.database, request.performanceId);
    const existingPerformance = await transaction.get(performanceRef);
    if (existingPerformance.exists()) {
      return { game: normalizeGameState((await transaction.get(refs.getGameDoc(request.database))).data() ?? createInitialGameState()), performance: existingPerformance.data() as Performance, reward: null, alreadyApplied: true };
    }

    const gameRef = refs.getGameDoc(request.database);
    const gameSnapshot = await transaction.get(gameRef);
    const current = gameSnapshot.exists() ? normalizeGameState(gameSnapshot.data()) : createInitialGameState();
    const rewardKey = getTourRewardKey(request.tourStopId);
    const rewardSnapshot = await transaction.get(refs.getRewardLedgerDoc(request.database, rewardKey));
    const currentWithLedger = rewardSnapshot.exists() && !current.claimedTourRewardKeys?.includes(rewardKey)
      ? { ...current, claimedTourRewardKeys: [...(current.claimedTourRewardKeys ?? []), rewardKey] }
      : current;
    const prepared = prepareTourPerformance(currentWithLedger, request.performanceId, request.tourStopId, request.songId, request.performedAt);
    if (!prepared) return null;

    transaction.set(performanceRef, prepared.performance);
    transaction.set(gameRef, prepared.game);
    if (prepared.reward) transaction.set(refs.getRewardLedgerDoc(request.database, prepared.reward.rewardKey), prepared.reward);
    return { ...prepared, alreadyApplied: false };
  });
};
