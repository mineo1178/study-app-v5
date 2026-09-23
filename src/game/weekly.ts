import { GAME_START } from "./config";
import { applyFanChange, getRivalBattle, getWeeklyGoalMinutes } from "./progression";
import type { ProducerGameState, WeeklyResult } from "./types";

const jstParts = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {} as Record<string, string>);
const jstDate = (date: Date) => { const p = jstParts(date); return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))); };
export const getWeekBoundsJst = (date = new Date()) => {
  const start = jstDate(date); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const startAt = start.getTime() - 9 * 60 * 60 * 1000;
  return { startAt, endAt: startAt + 7 * 24 * 60 * 60 * 1000 - 1 };
};
export const getWeekIdJst = (date = new Date()) => {
  const thursday = jstDate(date); thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const year = thursday.getUTCFullYear(); const firstThursday = new Date(Date.UTC(year, 0, 4)); firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  return `${year}-W${String(1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000)).padStart(2, "0")}`;
};
export const isFinalizableWeek = (date: Date, now = new Date()) => getWeekBoundsJst(date).endAt < now.getTime() && getWeekBoundsJst(date).endAt >= GAME_START;
export const createWeeklyResult = (game: ProducerGameState, entries: { duration: number; endAt?: number }[], date: Date): WeeklyResult => {
  const { startAt, endAt } = getWeekBoundsJst(date); const actualMinutes = entries.filter((entry) => (entry.endAt ?? 0) >= startAt && (entry.endAt ?? 0) <= endAt).reduce((total, entry) => total + Math.floor(entry.duration / 60), 0);
  const targetMinutes = getWeeklyGoalMinutes(new Date(startAt)); const battle = getRivalBattle(actualMinutes, targetMinutes); const fanAfter = applyFanChange(game.fans, battle.fanChange);
  return { weekId: getWeekIdJst(date), startAt, endAt, targetMinutes, actualMinutes, achievementRate: targetMinutes ? actualMinutes / targetMinutes : 0, battleResult: battle.status, rivalId: "sparkle", fanBefore: game.fans, fanDelta: fanAfter - game.fans, fanAfter, finalizedAt: Date.now(), version: "v1.68" };
};
