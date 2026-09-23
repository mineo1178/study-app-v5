import { ACTIVITY_POINT_MINUTES, LESSON_COST, LESSON_GAIN } from "./config";
import type { ProducerGameState, StudyHistoryLike } from "./types";

export const getSessionActivityPoints = (entry: StudyHistoryLike) => Math.floor((entry.creditedDuration ?? entry.duration) / 60 / ACTIVITY_POINT_MINUTES);
export const getUnclaimedRewards = (entries: StudyHistoryLike[], claimed: string[]) => entries.filter((entry) => !claimed.includes(entry.id)).reduce((sum, entry) => sum + getSessionActivityPoints(entry), 0);
export const claimRewards = (game: ProducerGameState, entries: StudyHistoryLike[]) => {
  const newEntries = entries.filter((entry) => !game.claimedSessionIds.includes(entry.id));
  return { ...game, activityPoints: game.activityPoints + newEntries.reduce((sum, entry) => sum + getSessionActivityPoints(entry), 0), claimedSessionIds: [...game.claimedSessionIds, ...newEntries.map((entry) => entry.id)] };
};
export const canLesson = (game: ProducerGameState) => game.activityPoints >= LESSON_COST;
export const lessonMember = (game: ProducerGameState, memberId: string, ability: keyof ProducerGameState["members"][number]["abilities"]) => {
  if (!canLesson(game)) return game;
  return { ...game, activityPoints: game.activityPoints - LESSON_COST, lessonsCompleted: game.lessonsCompleted + 1, members: game.members.map((member) => member.id === memberId ? { ...member, abilities: { ...member.abilities, [ability]: member.abilities[ability] + LESSON_GAIN } } : member) };
};
