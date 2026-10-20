import { isCalculationTask } from "../daily-calculation-view";
import { getCreditedStudyMinutes, LONG_SESSION_SECONDS, type StudyHistoryEntry } from "../study-utils";
import { isTokyoDomeCompleted } from "./tokyo-dome-progression";
import { getWeekBoundsJst, getWeekIdJst } from "./weekly";
import type { IdolMember, ProducerGameState } from "./types";

export type EncoreTask = { subject: string; category: string; pendingSync?: boolean; isRunning?: boolean; history: readonly (StudyHistoryEntry & { id?: string })[] };
export type EncoreReadStatus = "loading" | "ready" | "error";
export type EncoreContext = { scope: string; status: EncoreReadStatus; game: ProducerGameState; tasks: readonly EncoreTask[]; timerRunning: boolean };
const DAY_MS = 86400000;
const JST_MS = 32400000;

export function getEncoreMembers(game: ProducerGameState): IdolMember[] {
  const ids = game.activeMemberIds ?? [];
  if (ids.length !== 4 || new Set(ids).size !== 4 || !game.leaderMemberId || !ids.includes(game.leaderMemberId)) return [];
  const members = ids.map(id => game.members.find(member => member.id === id && member.joined));
  return members.every((member): member is IdolMember => !!member) ? members : [];
}

export function getEncoreStudyDays(tasks: readonly EncoreTask[], now: number): number[] {
  const { startAt, endAt } = getWeekBoundsJst(new Date(now));
  const days = new Set<number>();
  for (const task of tasks) {
    if (task.pendingSync || isCalculationTask(task) || !Array.isArray(task.history)) continue;
    for (const entry of task.history) {
      if (!entry || typeof entry !== "object") continue;
      const end = entry.endAt;
      const seconds = entry.creditedDuration;
      if (typeof entry.id !== "string" || !entry.id || !Number.isSafeInteger(end) ||
        end! < startAt || end! > endAt || end! > now ||
        !["not_required", "confirmed"].includes(entry.reviewStatus ?? "") ||
        !Number.isInteger(entry.duration) || entry.duration < 600 || entry.duration >= LONG_SESSION_SECONDS ||
        !Number.isInteger(seconds) || seconds! < 600 ||
        (entry.reviewFlags !== undefined && !Array.isArray(entry.reviewFlags)) ||
        seconds! > getCreditedStudyMinutes(entry.duration, entry.reviewFlags) * 60 ||
        (entry.reviewStatus === "confirmed" && entry.confirmedDurationSeconds !== entry.duration)) continue;
      days.add(Math.floor((end! + JST_MS) / DAY_MS) * DAY_MS - JST_MS);
    }
  }
  return [...days].sort((a, b) => a - b);
}

export function deriveEncore(game: ProducerGameState, tasks: readonly EncoreTask[], now: number, timerRunning = false) {
  const weekStartAt = getWeekBoundsJst(new Date(now)).startAt;
  const members = getEncoreMembers(game);
  const clear = isTokyoDomeCompleted(game);
  const songReady = game.songs.some(song => song.id === "mirai-encore" && song.status === "completed");
  const days = getEncoreStudyDays(tasks, now);
  const unlocked = clear && songReady && members.length === 4;
  const running = timerRunning || tasks.some(task => task.isRunning);
  return { weekId: getWeekIdJst(new Date(now)), weekStartAt, clear, songReady, members, days, unlocked, running,
    eligible: unlocked && days.length >= 3 && !running };
}
