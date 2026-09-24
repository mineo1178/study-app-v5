import type { IdolAbility, IdolMember, ProducerGameState } from "./types";

export const GAME_START = new Date("2026-09-23T00:00:00+09:00").getTime();
export const ACTIVITY_POINT_MINUTES = 10;
export const LESSON_COST = 6;
export const LESSON_GAIN = 2;
export const RIVAL_NAME = "Sparkle";
export const RIVAL_WEEKLY_HOURS = 12;
export const MEMBER_JOIN_COST = 18;
export const THIRD_MEMBER_JOIN_COST = 30;
export const RIVAL_FAN_CHANGES = { win: 120, close: 20, rivalWin: -20, lose: -40 } as const;
export const SONGS = [
  { id: "beginning-stage", title: "はじまりのステージ", requiredActivityPoints: 20, requiredMembers: 2, requiredMilestones: [], songType: "VOCAL", profile: { vocal: 2, harmony: 2, lyrics: 2, composition: 2 }, fanBonus: 8 },
  { id: "kirameki-step", title: "キラメキステップ", requiredActivityPoints: 35, requiredMembers: 3, requiredMilestones: ["first-live"], songType: "DANCE", profile: { dance: 3, choreography: 3, character: 2, harmony: 1 }, fanBonus: 12 },
] as const;
export const VENUES = [{ id: "practice-studio", name: "練習スタジオ", capacity: 30, unlockOrder: 1, requiredFans: 0, requiredSongs: 1, requiredMembers: 2, requiredMilestones: [] }, { id: "mini-live-house", name: "ミニライブハウス", capacity: 100, unlockOrder: 2, requiredFans: 50, requiredSongs: 1, requiredMembers: 2, requiredMilestones: ["first-live"] }] as const;
export const LIVE_COST = 5;
export const MINI_LIVE_HOUSE_SOLD_OUT_CAPACITY = 100;
export const NEXT_VENUE = { name: "地域ホール", capacity: 300, requirements: ["オリジナル曲2曲", "Sparkle初対バン勝利", "ミニライブハウス100席満員"] } as const;
export const SPARKLE_STAGES = [{ battleId: "sparkle-stage-1", rivalId: "sparkle", name: "Sparkle Stage 1", requiredMembers: 3, requiredSongs: 2, requiredVenueId: "mini-live-house", stats: { vocal: 32, dance: 36, song: 32, character: 34 }, rewards: { winFans: 300, winPoints: 10, participationFans: 20, participationPoints: 2 } }] as const;

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
  claimedSessionIds: [], lessonsCompleted: 0, songsCompleted: 0, rivalEventsCompleted: 0, producerStars: 0, boostRemainder: 0, milestones: {}, claimedRivalBattleIds: [], wonRivalBattleIds: [], songs: SONGS.map((song, index) => ({ ...song, status: index === 0 ? "available" : "locked", level: 1, performanceCount: 0, songStats: { vocal: 0, harmony: 0, dance: 0, character: 0, lyrics: 0, composition: 0, choreography: 0 } })),
});
export const normalizeGameState = (saved: Partial<ProducerGameState>): ProducerGameState => {
  const initial = createInitialGameState();
  const savedMembers = saved.members ?? [];
  const members = initial.members.map((member) => { const old = savedMembers.find((item) => item.id === member.id); return old ? { ...member, ...old, abilities: { ...member.abilities, ...(old.abilities ?? {}) } } : member; });
  const songs = initial.songs.map((song) => { const old = saved.songs?.find((item) => item.id === song.id); return old ? { ...song, ...old, profile: old.profile ?? song.profile, requiredMilestones: old.requiredMilestones ?? song.requiredMilestones, songType: old.songType ?? song.songType, songStats: { ...song.songStats, ...(old.songStats ?? {}) } } : song; });
  return { ...initial, ...saved, members, songs, milestones: { ...initial.milestones, ...(saved.milestones ?? {}) }, claimedRivalBattleIds: saved.claimedRivalBattleIds ?? [], wonRivalBattleIds: saved.wonRivalBattleIds ?? [] };
};
