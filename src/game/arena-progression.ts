import { MAJOR_DEBUT_REWARD_KEY, SONGS } from "./config";
import { getActiveMembers } from "./formation";
import type { ProducerGameState } from "./types";
export const ARENA_REQUIRED_FANS = 37000;
export const ARENA_LIVES = {
  "arena-prelude": { venueId: "arena-prelude", name: "アリーナ前哨ライブ", capacity: 15000, clearRate: .9, affinities: ["DANCE", "PERFORMANCE"], firstClearReward: { fans: 1500, activityPoints: 20 } },
  "arena-first": { venueId: "arena-first", name: "初アリーナライブ", capacity: 20000, clearRate: .9, affinities: ["HARMONY", "MESSAGE", "BALANCED"], firstClearReward: { fans: 3000, activityPoints: 40 } },
} as const;
export type ArenaLiveId = keyof typeof ARENA_LIVES;
export const getArenaRewardKey = (id: ArenaLiveId) => `${id}-first-clear`;
export const isArenaChapterUnlocked = (game: ProducerGameState) => game.claimedTourRewardKeys?.includes(MAJOR_DEBUT_REWARD_KEY) === true;
export const isArenaPreludeCompleted = (game: ProducerGameState) => game.claimedTourRewardKeys?.includes(getArenaRewardKey("arena-prelude")) === true;
export const isArenaCompleted = (game: ProducerGameState) => game.claimedTourRewardKeys?.includes(getArenaRewardKey("arena-first")) === true;
export const hasArenaSongs = (game: ProducerGameState) => SONGS.every((definition) => game.songs.some((song) => song.id === definition.id && song.status === "completed"));
export const canStartArenaLive = (game: ProducerGameState, id: ArenaLiveId) => isArenaChapterUnlocked(game) && game.fans >= ARENA_REQUIRED_FANS && hasArenaSongs(game) && getActiveMembers(game).length === 4 && (id === "arena-prelude" || isArenaPreludeCompleted(game));
export const getArenaAction = (game: ProducerGameState) => !isArenaChapterUnlocked(game) ? "メジャーデビューを成功させよう！" : isArenaCompleted(game) ? "次の目標：東京ドーム！" : game.fans < ARENA_REQUIRED_FANS ? `ライブでファンをあと${(ARENA_REQUIRED_FANS - game.fans).toLocaleString()}人増やそう！` : !hasArenaSongs(game) ? "6曲すべて完成させよう！" : getActiveMembers(game).length !== 4 ? "4人編成にしよう！" : !isArenaPreludeCompleted(game) ? "アリーナ前哨ライブに挑戦しよう！" : "初アリーナライブに挑戦しよう！";
