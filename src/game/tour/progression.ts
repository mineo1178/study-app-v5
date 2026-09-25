import { getMajorRivalIds } from "../progression";
import { TOUR_LEG_1_STOPS } from "./config";
import type { TourProgress, TourStopDefinition, TourStopId, TourStopStatus } from "./types";
import type { ProducerGameState } from "../types";

const stopById = (id: TourStopId) => TOUR_LEG_1_STOPS.find((stop) => stop.id === id)!;
const includes = (ids: TourStopId[], id: TourStopId) => ids.includes(id);
const completeIds = (progress: TourProgress) => new Set([...progress.completedStopIds, ...progress.soldOutStopIds]);

export const canUnlockNationalTour = (game: ProducerGameState) => Boolean(game.milestones?.cityHallSoldOut) && game.songs.filter((song) => song.status === "completed").length >= 4 && game.wonRivalBattleIds?.includes("nova-stage-1") === true && ["sparkle", "nova"].every((rival) => getMajorRivalIds(game).includes(rival));
export const getNationalTourMissingConditions = (game: ProducerGameState) => [
  !game.milestones?.cityHallSoldOut ? "シティホール800席 SOLD OUT" : null,
  !game.wonRivalBattleIds?.includes("nova-stage-1") ? "NOVA Stage 1 CLEAR" : null,
  game.songs.filter((song) => song.status === "completed").length < 4 ? "オリジナル曲4曲" : null,
].filter((condition): condition is string => !!condition);
export const getTourClearAudience = (stop: TourStopDefinition) => Math.ceil(stop.capacity * stop.clearRate);
export const capTourAudience = (stop: TourStopDefinition, audience: number) => Math.max(0, Math.min(stop.capacity, Math.floor(audience)));
export const isTourStopCleared = (stop: TourStopDefinition, audience: number) => audience >= getTourClearAudience(stop);
export const isTourStopSoldOut = (stop: TourStopDefinition, audience: number) => audience >= stop.capacity;
export const getTourStopStatus = (game: ProducerGameState, stopId: TourStopId): TourStopStatus => {
  if (!canUnlockNationalTour(game)) return "locked";
  const progress = game.tourProgress ?? { completedStopIds: [], soldOutStopIds: [], leg1Completed: false };
  if (includes(progress.soldOutStopIds, stopId)) return "sold-out";
  if (includes(progress.completedStopIds, stopId)) return "clear";
  const index = TOUR_LEG_1_STOPS.findIndex((stop) => stop.id === stopId);
  return index === 0 || completeIds(progress).has(TOUR_LEG_1_STOPS[index - 1].id) ? "open" : "locked";
};
export const canStartTourStop = (game: ProducerGameState, stopId: TourStopId) => getTourStopStatus(game, stopId) !== "locked";
export const getCurrentTourStop = (game: ProducerGameState) => TOUR_LEG_1_STOPS.find((stop) => getTourStopStatus(game, stop.id) === "open") ?? null;
export const isTourLeg1Completed = (progress: TourProgress) => TOUR_LEG_1_STOPS.every((stop) => completeIds(progress).has(stop.id));
export const getTourNextGoal = (game: ProducerGameState) => {
  if (!canUnlockNationalTour(game)) return null;
  if (game.tourProgress?.leg1Completed) return "次は新曲と次のツアーへ！";
  const stop = getCurrentTourStop(game);
  return stop ? `全国ツアー ${stop.city}公演をCLEARしよう！` : null;
};
export const getTourLeg1ProgressLabel = (game: ProducerGameState) => !canUnlockNationalTour(game) ? "未開始" : game.tourProgress?.leg1Completed ? "前半 COMPLETE" : "前半進行中";
export const getTourStop = stopById;
