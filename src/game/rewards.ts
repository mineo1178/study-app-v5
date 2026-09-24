import { ACTIVITY_POINT_MINUTES, LESSON_COST, LESSON_GAIN, MEMBER_JOIN_COST, THIRD_MEMBER_JOIN_COST, YUNA_JOIN_COST } from "./config";
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
export const canJoinMember = (game: ProducerGameState) => game.activityPoints >= MEMBER_JOIN_COST && game.members.filter((member) => member.joined).length === 1 && !game.members.find((member) => member.id === "japanese")?.joined;
export const joinNextMember = (game: ProducerGameState) => {
  if (!canJoinMember(game)) return game;
  const next = game.members.find((member) => member.id === "japanese")!;
  return { ...game, activityPoints: game.activityPoints - MEMBER_JOIN_COST, members: game.members.map((member) => member.id === next.id ? { ...member, joined: true } : member), activeMemberIds: [...(game.activeMemberIds ?? game.members.filter((member) => member.joined).map((member) => member.id)), next.id].filter((id, index, values) => values.indexOf(id) === index).slice(0, 4) };
};
export const canRecruitThirdMember = (game: ProducerGameState, hasFirstLive: boolean) => game.members.filter((member) => member.joined).length === 2 && game.songs[0]?.status === "completed" && hasFirstLive && game.activityPoints >= THIRD_MEMBER_JOIN_COST;
export const recruitThirdMember = (game: ProducerGameState, hasFirstLive: boolean) => {
  if (!canRecruitThirdMember(game, hasFirstLive)) return game;
  return { ...game, activityPoints: game.activityPoints - THIRD_MEMBER_JOIN_COST, members: game.members.map((member) => member.id === "science" ? { ...member, joined: true } : member), activeMemberIds: [...(game.activeMemberIds ?? game.members.filter((member) => member.joined).map((member) => member.id)), "science"].filter((id, index, values) => values.indexOf(id) === index).slice(0, 4) };
};
export const getYunaRecruitmentStatus = (game: ProducerGameState) => {
  const member = (id: string) => game.members.find((candidate) => candidate.id === id)?.joined === true;
  if (member("yuna")) return { canRecruit: false, reason: "ユナはすでに加入しています" };
  if (!["math", "japanese", "science"].every(member)) return { canRecruit: false, reason: "ミオ・コトハ・リナをそろえよう" };
  if (game.songs.filter((song) => song.status === "completed").length < 2) return { canRecruit: false, reason: "オリジナル曲を2曲完成させよう" };
  if (!game.wonRivalBattleIds?.includes("sparkle-stage-1")) return { canRecruit: false, reason: "Sparkleとの初対バンに勝とう" };
  if (!game.milestones?.miniLiveHouseSoldOut) return { canRecruit: false, reason: "ミニライブハウスを100席満員にしよう" };
  if (game.activityPoints < YUNA_JOIN_COST) return { canRecruit: false, reason: `あと${YUNA_JOIN_COST - game.activityPoints}Pでユナを迎えられるよ` };
  return { canRecruit: true, reason: "ユナを迎えよう！" };
};
export const recruitYuna = (game: ProducerGameState, now = Date.now()): ProducerGameState => {
  if (!getYunaRecruitmentStatus(game).canRecruit) return game;
  return {
    ...game,
    activityPoints: game.activityPoints - YUNA_JOIN_COST,
    members: game.members.map((member) => member.id === "yuna" ? { ...member, joined: true, joinedAt: now } : member),
    activeMemberIds: [...(game.activeMemberIds ?? game.members.filter((member) => member.joined).map((member) => member.id)).filter((id) => id !== "social"), "yuna"].filter((id, index, values) => values.indexOf(id) === index).slice(0, 4),
    milestones: { ...game.milestones, starterGroupCompleted: true },
  };
};
