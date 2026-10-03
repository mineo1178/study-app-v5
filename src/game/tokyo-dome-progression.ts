import { hasArenaSongs, isArenaCompleted } from "./arena-progression";
import { getActiveMembers } from "./formation";
import type { ProducerGameState } from "./types";

export const TOKYO_DOME_REQUIRED_FANS = 75000;
export const TOKYO_DOME_REWARD_KEY = "tokyo-dome-first-clear";
export const TOKYO_DOME_LIVE = { venueId: "tokyo-dome", name: "東京ドームライブ", capacity: 55000, clearRate: .9, affinities: ["HARMONY", "MESSAGE", "BALANCED"], firstClearReward: { fans: 5000, activityPoints: 50 } } as const;
export const isTokyoDomeChapterUnlocked = isArenaCompleted;
export const isTokyoDomeCompleted = (game: ProducerGameState) => game.claimedTourRewardKeys?.includes(TOKYO_DOME_REWARD_KEY) === true;
export const canStartTokyoDomeLive = (game: ProducerGameState) => isTokyoDomeChapterUnlocked(game) && game.fans >= TOKYO_DOME_REQUIRED_FANS && hasArenaSongs(game) && getActiveMembers(game).length === 4;
export const getTokyoDomeAction = (game: ProducerGameState) => !isTokyoDomeChapterUnlocked(game) ? "初アリーナライブを成功させよう！" : game.fans < TOKYO_DOME_REQUIRED_FANS ? `あと${(TOKYO_DOME_REQUIRED_FANS - game.fans).toLocaleString()}人ファンを増やそう！` : !hasArenaSongs(game) ? "6曲すべて完成させよう！" : getActiveMembers(game).length !== 4 ? "4人編成にしよう！" : "曲とリーダーを選んで東京ドームに挑戦しよう！";
