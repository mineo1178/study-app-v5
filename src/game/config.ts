import type { IdolAbility, IdolMember, ProducerGameState } from "./types";

export const GAME_START = new Date("2026-09-23T00:00:00+09:00").getTime();
export const ACTIVITY_POINT_MINUTES = 10;
export const LESSON_COST = 6;
export const LESSON_GAIN = 2;
export const RIVAL_NAME = "Sparkle";
export const RIVAL_WEEKLY_HOURS = 12;
export const MEMBER_JOIN_COST = 18;
export const RIVAL_FAN_CHANGES = { win: 120, close: 20, rivalWin: -20, lose: -40 } as const;

export const MONTHLY_STUDY_GOALS: Record<string, number> = {
  "2026-09": 43, "2026-10": 46, "2026-11": 48, "2026-12": 50,
  "2027-01": 52, "2027-02": 56, "2027-03": 60, "2027-04": 64,
  "2027-05": 68, "2027-06": 72, "2027-07": 78, "2027-08": 88,
  "2027-09": 90, "2027-10": 94, "2027-11": 98, "2027-12": 102,
  "2028-01": 106,
};

const abilities = (primary: IdolAbility, secondary: IdolAbility): Record<IdolAbility, number> => ({
  vocal: primary === "vocal" ? 14 : 10, harmony: primary === "harmony" || secondary === "harmony" ? 14 : 10,
  dance: primary === "dance" ? 14 : 10, character: primary === "character" ? 14 : 10,
  lyrics: primary === "lyrics" ? 14 : 10, composition: primary === "composition" || secondary === "composition" ? 14 : 10,
  choreography: primary === "choreography" || secondary === "choreography" ? 14 : 10,
});

export const INITIAL_MEMBERS: IdolMember[] = [
  { id: "math", name: "ミオ", specialty: "歌唱・作曲・リズム", joined: true, abilities: abilities("vocal", "composition") },
  { id: "japanese", name: "コトハ", specialty: "作詞・ハモリ・表現", joined: false, abilities: abilities("lyrics", "harmony") },
  { id: "science", name: "リナ", specialty: "ダンス・振付・テクニック", joined: false, abilities: abilities("dance", "choreography") },
  { id: "social", name: "サキ", specialty: "キャラ・MC・ファン対応", joined: false, abilities: abilities("character", "character") },
];

export const createInitialGameState = (): ProducerGameState => ({
  activityPoints: 0, fans: 120, members: INITIAL_MEMBERS.map((member) => ({ ...member, abilities: { ...member.abilities } })),
  claimedSessionIds: [], lessonsCompleted: 0, songsCompleted: 0, rivalEventsCompleted: 0, producerStars: 0, boostRemainder: 0,
});
