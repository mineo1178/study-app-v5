import type { IdolMember, ProducerGameState } from "./types";

/** Returns the at-most-four members participating in gameplay, with a legacy-safe fallback. */
export const getActiveMembers = (game: ProducerGameState): IdolMember[] => {
  const activeIds = game.activeMemberIds ?? game.members.filter((member) => member.joined).map((member) => member.id);
  return activeIds.slice(0, 4).map((id) => game.members.find((member) => member.id === id && member.joined)).filter((member): member is IdolMember => !!member);
};
export const validateFormation = (game: ProducerGameState, memberIds: string[]) => memberIds.length <= 4 && new Set(memberIds).size === memberIds.length && memberIds.every((id) => game.members.some((member) => member.id === id && member.joined));
export const getFormationLeaderFallback = (memberIds: string[], currentLeader: string | null | undefined) => currentLeader && memberIds.includes(currentLeader) ? currentLeader : memberIds[0] ?? null;
export const normalizeFormation = (game: ProducerGameState, memberIds = game.activeMemberIds ?? game.members.filter((member) => member.joined).map((member) => member.id), leaderId = game.leaderMemberId) => {
  const activeMemberIds = Array.from(new Set(memberIds)).filter((id) => game.members.some((member) => member.id === id && member.joined)).slice(0, 4);
  return { activeMemberIds, leaderMemberId: getFormationLeaderFallback(activeMemberIds, leaderId) };
};
