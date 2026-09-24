import { GAME_START, MONTHLY_STUDY_GOALS, RIVAL_FAN_CHANGES, RIVAL_WEEKLY_HOURS } from "./config";
import type { ProducerGameState } from "./types";

export const getMonthlyGoalHours = (date: Date) => MONTHLY_STUDY_GOALS[`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`] ?? 106;
export const getMonthlyGoalMinutes = (date: Date) => {
  const base = getMonthlyGoalHours(date) * 60;
  if (date.getFullYear() !== 2026 || date.getMonth() !== 8) return base;
  const monthEnd = new Date(2026, 9, 0).getTime();
  return Math.round(base * Math.max(0, monthEnd - GAME_START + 86400000) / (30 * 86400000));
};
export const getWeeklyGoalMinutes = (date = new Date()) => Math.round(getMonthlyGoalMinutes(date) / 4.35);
export const startOfWeek = (date = new Date()) => { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
export const getWeekStudyMinutes = (entries: { duration: number; creditedDuration?: number; endAt?: number }[], now = new Date()) => {
  const start = startOfWeek(now).getTime();
  return entries.filter((entry) => (entry.endAt ?? 0) >= start).reduce((sum, entry) => sum + Math.floor((entry.creditedDuration ?? entry.duration) / 60), 0);
};
export const getRivalBattle = (minutes: number, goalMinutes: number) => {
  const rate = goalMinutes ? minutes / goalMinutes : 0;
  const remaining = Math.max(0, goalMinutes - minutes);
  if (rate >= 1) return { status: "WIN", fanChange: RIVAL_FAN_CHANGES.win, remaining, message: "Sparkleに勝利！ファンが増えるよ" };
  if (rate >= .9) return { status: "接戦", fanChange: RIVAL_FAN_CHANGES.close, remaining, message: "あと少しでSparkleに勝利！" };
  if (rate >= .8) return { status: "Sparkle WIN", fanChange: RIVAL_FAN_CHANGES.rivalWin, remaining, message: "あと少しで追いつけるよ" };
  return { status: rate >= .7 ? "LOSE" : "BIG LOSS", fanChange: RIVAL_FAN_CHANGES.lose, remaining, message: "今週の目標に向かって進もう" };
};
export const applyFanChange = (fans: number, change: number) => Math.max(0, fans + change);
export const getTokyoDomeMissions = (game: ProducerGameState, recentWeekRate = 0) => [
  { label: "4人のメンバーをそろえる", done: ["math", "japanese", "science", "yuna"].every((id) => game.members.some((member) => member.id === id && member.joined)) },
  { label: "メンバー育成ミッションを達成", done: game.lessonsCompleted >= 20 },
  { label: "オリジナル曲を5曲完成", done: game.songsCompleted >= 5 },
  { label: "ファン45,000人", done: game.fans >= 45000 },
  { label: "全国ツアー完走", done: false },
  { label: "ライバル3組との重要イベント達成", done: game.rivalEventsCompleted >= 3 },
  { label: "プロデューサー条件達成", done: game.producerStars >= 7 && recentWeekRate >= .9 },
];
export const RIVAL_TARGET_HOURS = RIVAL_WEEKLY_HOURS;
