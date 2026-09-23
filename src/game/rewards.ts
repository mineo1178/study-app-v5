import { ACTIVITY_POINT_MINUTES, LESSON_COST, LESSON_GAIN, MEMBER_JOIN_COST, THIRD_MEMBER_JOIN_COST } from "./config";
import { calculateBoostedPoints } from "./test-bonus";
import type { ProducerGameState, StudyHistoryLike } from "./types";

export const getSessionActivityPoints = (entry: StudyHistoryLike) => Math.floor((entry.creditedDuration ?? entry.duration) / 60 / ACTIVITY_POINT_MINUTES);
export const getUnclaimedRewards = (entries: StudyHistoryLike[], claimed: string[]) => entries.filter((entry) => !claimed.includes(entry.id)).reduce((sum, entry) => sum + getSessionActivityPoints(entry), 0);
export const claimRewards = (game: ProducerGameState, entries: StudyHistoryLike[], boostPercent = 0) => {
  const newEntries = entries.filter((entry) => !game.claimedSessionIds.includes(entry.id));
  const basePoints = newEntries.reduce((sum, entry) => sum + getSessionActivityPoints(entry), 0);
  const reward = calculateBoostedPoints(basePoints, boostPercent, game.boostRemainder || 0);
  return { ...game, activityPoints: game.activityPoints + reward.totalPoints, boostRemainder: reward.remainder, claimedSessionIds: [...game.claimedSessionIds, ...newEntries.map((entry) => entry.id)] };
};
export const canLesson = (game: ProducerGameState) => game.activityPoints >= LESSON_COST;
export const lessonMember = (game: ProducerGameState, memberId: string, ability: keyof ProducerGameState["members"][number]["abilities"]) => {
  if (!canLesson(game)) return game;
  return { ...game, activityPoints: game.activityPoints - LESSON_COST, lessonsCompleted: game.lessonsCompleted + 1, members: game.members.map((member) => member.id === memberId ? { ...member, abilities: { ...member.abilities, [ability]: member.abilities[ability] + LESSON_GAIN } } : member) };
};
export const canJoinMember = (game: ProducerGameState) => game.activityPoints >= MEMBER_JOIN_COST && game.members.some((member) => !member.joined);
export const joinNextMember = (game: ProducerGameState) => {
  if (!canJoinMember(game)) return game;
  const next = game.members.find((member) => !member.joined)!;
  return { ...game, activityPoints: game.activityPoints - MEMBER_JOIN_COST, members: game.members.map((member) => member.id === next.id ? { ...member, joined: true } : member) };
};
export const canRecruitThirdMember = (game: ProducerGameState, hasFirstLive: boolean) => game.members.filter((member) => member.joined).length === 2 && game.songs[0]?.status === "completed" && hasFirstLive && game.activityPoints >= THIRD_MEMBER_JOIN_COST;
export const recruitThirdMember = (game: ProducerGameState, hasFirstLive: boolean) => {
  if (!canRecruitThirdMember(game, hasFirstLive)) return game;
  return { ...game, activityPoints: game.activityPoints - THIRD_MEMBER_JOIN_COST, members: game.members.map((member) => member.id === "science" ? { ...member, joined: true } : member) };
};
