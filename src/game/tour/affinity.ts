import type { OriginalSong } from "../types";
import type { TourStopDefinition } from "./types";

export const TOUR_AFFINITY_PERCENT = 8;
export const getTourAffinityPercent = (stop: TourStopDefinition, song: OriginalSong) => stop.affinities.includes(song.songType as never) ? TOUR_AFFINITY_PERCENT : 0;
