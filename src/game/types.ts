export type IdolAbility = "vocal" | "harmony" | "dance" | "character" | "lyrics" | "composition" | "choreography";
export type StarterMemberId = "mio" | "kotoha" | "rina" | "yuna";
export type MemberId = string;
export type SubjectType = "math" | "japanese" | "science" | "social";
export type MemberStats = Record<IdolAbility, number>;
export type LeaderSkillId = "perfect-pitch" | "heartful-words" | "perfect-step" | "fan-maker";
export type LeaderSkillDefinition = { id: LeaderSkillId; name: string; description: string; effect: { type: "battle-category"; category: "vocal" | "dance" | "song"; percent: number } | { type: "live-fan-gain"; percent: number } };
export type MemberDefinition = { id: MemberId; name: string; subjectType: SubjectType; sourceType: "starter" | "gacha"; baseStats: MemberStats; leaderSkill: LeaderSkillDefinition; rarity?: "N" | "R" | "SR" | "SSR"; variantId?: string };

export type IdolMember = {
  id: MemberId;
  name: string;
  specialty: string;
  joined: boolean;
  joinedAt?: number;
  abilities: MemberStats;
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
  milestones?: { miniLiveHouseSoldOut?: boolean; starterGroupCompleted?: boolean; [key: string]: boolean | undefined };
  claimedRivalBattleIds?: string[];
  wonRivalBattleIds?: string[];
  activeMemberIds?: MemberId[];
  leaderMemberId?: MemberId | null;
};
export type SongType = "VOCAL" | "DANCE" | "MESSAGE" | "BALANCED" | "PERFORMANCE";
export type SongStats = Record<IdolAbility, number>;
export type OriginalSong = { id: string; title: string; status: "locked" | "available" | "in_progress" | "completed"; createdAt?: number; completedAt?: number; level: number; performanceCount: number; requiredActivityPoints: number; requiredMembers: number; requiredMilestones?: readonly string[]; songType: SongType; profile: Partial<Record<IdolAbility, number>>; songStats: SongStats; fanBonus: number; };
export type FormationSnapshot = { activeMemberIds: MemberId[]; leaderMemberId: MemberId | null; leaderSkillId: LeaderSkillId | null };
export type Performance = { performanceId: string; songId: string; venueId: string; performedAt: number; audience: number; capacity: number; rating: "GOOD" | "GREAT" | "PERFECT"; fanGain: number; fanBefore: number; fanAfter: number; version: string; formation?: FormationSnapshot; leaderBonus?: { skillId: LeaderSkillId; baseFanGain: number; bonusFanGain: number; finalFanGain: number } | null; };
export type BattleCategory = "vocal" | "dance" | "song" | "character";
export type RivalBattleRecord = { battleId: string; rivalId: string; playedAt: number; songId: string; stage?: number; categoryResults: Record<BattleCategory, "WIN" | "LOSE" | "DRAW">; overallResult: "PERFECT WIN" | "WIN" | "DRAW" | "Sparkle WIN"; fanGain: number; bonusPoints: number; version: string; formation?: FormationSnapshot; categoryScores?: Partial<Record<BattleCategory, { playerScore: number; rivalScore: number; leaderBonusApplied: number }>>; };

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
