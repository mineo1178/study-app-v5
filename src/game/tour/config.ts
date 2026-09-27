import type { TourId, TourStopDefinition } from "./types";

export const NATIONAL_TOUR_ID: TourId = "national-tour-1";
export const TOUR_LEG_1_STOPS: readonly TourStopDefinition[] = [
  { id: "tour-stop-1", order: 1, displayName: "Tour Leg 1 - 名古屋", city: "名古屋", capacity: 1200, clearRate: 0.75, affinities: ["VOCAL", "HARMONY"], firstClearReward: { fans: 300, activityPoints: 10 } },
  { id: "tour-stop-2", order: 2, displayName: "Tour Leg 1 - 大阪", city: "大阪", capacity: 1800, clearRate: 0.75, affinities: ["DANCE"], firstClearReward: { fans: 450, activityPoints: 12 } },
  { id: "tour-stop-3", order: 3, displayName: "Tour Leg 1 - 福岡", city: "福岡", capacity: 2500, clearRate: 0.75, affinities: ["PERFORMANCE", "CHARACTER"], firstClearReward: { fans: 600, activityPoints: 15 } },
];
export const TOUR_LEG_2_STOPS: readonly TourStopDefinition[] = [
  { id: "tour-stop-4", order: 4, displayName: "Tour Leg 2 - 広島", city: "広島", capacity: 3200, clearRate: 0.78, affinities: ["MESSAGE", "HARMONY"], firstClearReward: { fans: 750, activityPoints: 18 } },
  { id: "tour-stop-5", order: 5, displayName: "Tour Leg 2 - 仙台", city: "仙台", capacity: 4000, clearRate: 0.8, affinities: ["DANCE", "PERFORMANCE"], firstClearReward: { fans: 900, activityPoints: 20 } },
  { id: "tour-stop-6", order: 6, displayName: "Tour Final - 東京", city: "東京", capacity: 5000, clearRate: 0.82, affinities: ["VOCAL", "CHARACTER"], firstClearReward: { fans: 1200, activityPoints: 25 } },
];
export const TOUR_STOPS: readonly TourStopDefinition[] = [...TOUR_LEG_1_STOPS, ...TOUR_LEG_2_STOPS];
export const TOUR_STOP_IDS = TOUR_STOPS.map((stop) => stop.id);
