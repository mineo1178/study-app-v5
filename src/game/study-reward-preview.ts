import { getCreditedStudyMinutes, getElapsedSeconds, getLatestRunningTask, getSessionReviewFlags, MAX_CREDITED_STUDY_SECONDS, MIN_CREDITED_STUDY_SECONDS, type StudyTaskLike, type SessionReviewFlag } from "../study-utils";
import { ACTIVITY_POINT_MINUTES } from "./config";
import { getNextTicketThreshold } from "./gacha/logic";
import type { GachaState } from "./gacha/types";
import { getWeekStudyMinutes, getWeeklyGoalMinutes } from "./progression";
import { getUnclaimedRewards } from "./rewards";
import type { StudyHistoryLike } from "./types";

type PreviewTask = StudyTaskLike & { sessionReviewFlags?: SessionReviewFlag[] };
export type RewardPreview = { id: string; remaining: number; text: string };
export const getStudyRewardPreview = (tasks: PreviewTask[], entries: StudyHistoryLike[], claimed: string[], gacha: GachaState, now: number) => {
  const running = getLatestRunningTask(tasks);
  const seconds = running ? getElapsedSeconds(running, now) : 0;
  const flags = getSessionReviewFlags(seconds, running?.sessionReviewFlags ?? []);
  const credited = getCreditedStudyMinutes(seconds, flags);
  const candidates: RewardPreview[] = [];
  if (getUnclaimedRewards(entries, claimed) > 0) candidates.push({ id: "points-ready", remaining: 0, text: "活動Pを受け取れるよ！ プロデュースへ" });
  if (credited >= ACTIVITY_POINT_MINUTES) candidates.push({ id: "points-save", remaining: 0, text: "STOPして記録すると活動Pをもらえるよ！" });
  else if (!flags.length) candidates.push({ id: "points", remaining: Math.ceil(Math.max(0, Math.max(MIN_CREDITED_STUDY_SECONDS, ACTIVITY_POINT_MINUTES * 60) - seconds) / 60), text: "活動P！ STOPして記録しよう" });
  if (Object.values(gacha.ticketBalances).some((count) => count > 0)) candidates.push({ id: "gacha-ready", remaining: 0, text: "ガチャに挑戦できるよ！ プロデュースへ" });
  else {
    const forecast = getNextTicketThreshold(getWeekStudyMinutes(entries, new Date(now)) + credited, getWeeklyGoalMinutes(new Date(now)));
    if (forecast.nextPercent === null) candidates.push({ id: "gacha-max", remaining: 0, text: "今週のガチャ目標は達成！ 週が終わると受け取れるよ" });
    else candidates.push({ id: "gacha", remaining: forecast.minutesToNext, text: "週間ガチャの次の目標！ 週が終わると受け取れるよ" });
  }
  if (Object.values(gacha.itemInventory).some((count) => count > 0)) candidates.push({ id: "item-ready", remaining: 0, text: "アイテムでメンバーを育てられるよ！" });
  const day = (time: number) => new Date(time).toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  const todayMinutes = entries.filter((entry) => entry.endAt && day(entry.endAt) === day(now)).reduce((total, entry) => total + Math.floor((entry.creditedDuration ?? entry.duration) / 60), 0);
  return { todayMinutes: todayMinutes + credited, rewards: candidates.sort((a, b) => a.remaining - b.remaining).slice(0, 3), capped: seconds >= MAX_CREDITED_STUDY_SECONDS && !flags.length };
};
