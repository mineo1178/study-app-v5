import { MONTHLY_STUDY_GOALS, RIVAL_WEEKLY_HOURS } from "./config";
import type { ProducerGameState } from "./types";

export const getMonthlyGoalHours = (date: Date) => MONTHLY_STUDY_GOALS[`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`] ?? 106;
export const getWeeklyGoalMinutes = (date = new Date()) => Math.round((getMonthlyGoalHours(date) * 60) / 4.35);
export const startOfWeek = (date = new Date()) => { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
export const getWeekStudyMinutes = (entries: { duration: number; endAt?: number }[], now = new Date()) => {
  const start = startOfWeek(now).getTime();
  return entries.filter((entry) => (entry.endAt ?? 0) >= start).reduce((sum, entry) => sum + Math.floor(entry.duration / 60), 0);
};
export const getRivalBattle = (minutes: number, goalMinutes: number) => {
  const rate = goalMinutes ? minutes / goalMinutes : 0;
  const remaining = Math.max(0, goalMinutes - minutes);
  if (rate >= 1) return { status: "WIN", fanChange: 120, remaining, message: "Sparkleに勝利！ファンが増えるよ" };
  if (rate >= .9) return { status: "接戦", fanChange: 20, remaining, message: "あと少しでSparkleに勝利！" };
  if (rate >= .8) return { status: "Sparkle WIN", fanChange: -20, remaining, message: "あと少しで追いつけるよ" };
  return { status: "Sparkle優勢", fanChange: -Math.min(40, Math.round(120 * (1 - rate))), remaining, message: "今週の目標に向かって進もう" };
};
export const getTokyoDomeMissions = (game: ProducerGameState, recentWeekRate = 0) => [
  { label: "4人のメンバーをそろえる", done: game.members.every((m) => m.joined) },
  { label: "メンバー育成ミッションを達成", done: game.lessonsCompleted >= 20 },
  { label: "オリジナル曲を5曲完成", done: game.songsCompleted >= 5 },
  { label: "ファン45,000人", done: game.fans >= 45000 },
  { label: "全国ツアー完走", done: false },
  { label: "ライバル3組との重要イベント達成", done: game.rivalEventsCompleted >= 3 },
  { label: "プロデューサー条件達成", done: game.producerStars >= 7 && recentWeekRate >= .9 },
];
export const RIVAL_TARGET_HOURS = RIVAL_WEEKLY_HOURS;
