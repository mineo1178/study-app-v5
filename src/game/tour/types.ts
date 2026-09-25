export type TourId = "national-tour-1";
export type TourStopId = "tour-stop-1" | "tour-stop-2" | "tour-stop-3";
export type TourStopStatus = "locked" | "open" | "clear" | "sold-out";
export type TourAffinity = "VOCAL" | "HARMONY" | "DANCE" | "PERFORMANCE" | "CHARACTER";

export type TourStopReward = { fans: number; activityPoints: number };
export type TourStopDefinition = { id: TourStopId; order: number; displayName: string; city: string; capacity: number; clearRate: number; affinities: readonly TourAffinity[]; firstClearReward: TourStopReward };
export type TourProgress = { completedStopIds: TourStopId[]; soldOutStopIds: TourStopId[]; leg1Completed: boolean };
