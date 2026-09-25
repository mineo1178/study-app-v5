import { getActiveMembers } from "../formation";
import { applyLeaderSkillToLiveFanGain } from "../leader-skills";
import { calculateFanGain, calculateLiveScore, getLiveRating } from "../song-live";
import type { ProducerGameState } from "../types";
import { TOUR_LEG_1_STOPS } from "./config";
import { getTourAffinityPercent } from "./affinity";
import { capTourAudience, getTourClearAudience, getTourStop, isTourStopCleared, isTourStopSoldOut } from "./progression";
import type { TourStopId } from "./types";

export type TourSimulation = { tourStopId: TourStopId; audience: number; baseAudience: number; capacity: number; clearThreshold: number; isClear: boolean; isSoldOut: boolean; rating: "GOOD" | "GREAT" | "PERFECT"; fanGain: number; appliedAffinityPercent: number; appliedLeaderEffect: number; activeMemberIds: string[]; selectedSongId: string };
export const simulateTourPerformance = (game: ProducerGameState, tourStopId: TourStopId, selectedSongId: string): TourSimulation | null => {
  const stop = getTourStop(tourStopId); const song = game.songs.find((item) => item.id === selectedSongId && item.status === "completed"); if (!song) return null;
  const activeMemberIds = getActiveMembers(game).map((member) => member.id); const affinity = getTourAffinityPercent(stop, song); const liveScore = calculateLiveScore(game, song); const baseAudience = Math.max(0, Math.round(stop.capacity * Math.min(1, .55 + liveScore / 200))); const audience = capTourAudience(stop, Math.round(baseAudience * (1 + affinity / 100))); const rating = getLiveRating(liveScore * (1 + affinity / 100)); const leader = applyLeaderSkillToLiveFanGain(game, calculateFanGain(audience, rating, song));
  return { tourStopId, audience, baseAudience, capacity: stop.capacity, clearThreshold: getTourClearAudience(stop), isClear: isTourStopCleared(stop, audience), isSoldOut: isTourStopSoldOut(stop, audience), rating, fanGain: leader.finalFanGain, appliedAffinityPercent: affinity, appliedLeaderEffect: leader.bonusFanGain, activeMemberIds, selectedSongId: song.id };
};
export const getTourStopDefinition = (id: TourStopId) => TOUR_LEG_1_STOPS.find((stop) => stop.id === id)!;
