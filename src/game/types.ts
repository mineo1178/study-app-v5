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
  milestones?: { miniLiveHouseSoldOut?: boolean };
  claimedRivalBattleIds?: string[];
  wonRivalBattleIds?: string[];
};
export type SongType = "VOCAL" | "DANCE" | "MESSAGE" | "BALANCED";
export type SongStats = Record<IdolAbility, number>;
export type OriginalSong = { id: string; title: string; status: "locked" | "available" | "in_progress" | "completed"; createdAt?: number; completedAt?: number; level: number; performanceCount: number; requiredActivityPoints: number; requiredMembers: number; requiredMilestones?: readonly string[]; songType: SongType; profile: Partial<Record<IdolAbility, number>>; songStats: SongStats; fanBonus: number; };
export type Performance = { performanceId: string; songId: string; venueId: string; performedAt: number; audience: number; capacity: number; rating: "GOOD" | "GREAT" | "PERFECT"; fanGain: number; fanBefore: number; fanAfter: number; version: string; };
export type BattleCategory = "vocal" | "dance" | "song" | "character";
export type RivalBattleRecord = { battleId: string; rivalId: string; playedAt: number; songId: string; categoryResults: Record<BattleCategory, "WIN" | "LOSE" | "DRAW">; overallResult: "PERFECT WIN" | "WIN" | "DRAW" | "Sparkle WIN"; fanGain: number; bonusPoints: number; version: string; };

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
