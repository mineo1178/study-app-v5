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
};

export type StudyHistoryLike = {
  id: string;
  creditedDuration?: number;
  duration: number;
  endAt?: number;
};
