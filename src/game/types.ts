export type IdolAbility = "vocal" | "harmony" | "dance" | "character" | "lyrics" | "composition" | "choreography";

export type IdolMember = {
  id: "math" | "japanese" | "science" | "social";
  name: string;
  specialty: string;
  joined: boolean;
  abilities: Record<IdolAbility, number>;
};

export type ProducerGameState = {
  activityPoints: number;
  fans: number;
  members: IdolMember[];
  claimedSessionIds: string[];
  lessonsCompleted: number;
  songsCompleted: number;
  rivalEventsCompleted: number;
  producerStars: number;
  boostRemainder: number;
  songs: OriginalSong[];
};
export type OriginalSong = { id: string; title: string; status: "locked" | "available" | "in_progress" | "completed"; createdAt?: number; completedAt?: number; level: number; performanceCount: number; requiredActivityPoints: number; requiredMembers: number; songStats: { vocal: number; lyrics: number; composition: number; dance: number }; fanBonus: number; };
export type Performance = { performanceId: string; songId: string; venueId: string; performedAt: number; audience: number; capacity: number; rating: "GOOD" | "GREAT" | "PERFECT"; fanGain: number; fanBefore: number; fanAfter: number; version: string; };

export type WeeklyResult = {
  weekId: string;
  startAt: number;
  endAt: number;
  targetMinutes: number;
  actualMinutes: number;
  achievementRate: number;
  battleResult: string;
  rivalId: string;
  fanBefore: number;
  fanDelta: number;
  fanAfter: number;
  finalizedAt: number;
  version: string;
};

export type StudyHistoryLike = {
  id: string;
  creditedDuration?: number;
  duration: number;
  endAt?: number;
};
