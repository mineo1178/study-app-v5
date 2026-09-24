import type { IdolMember, ProducerGameState } from "./types";

/** Returns the at-most-four members participating in gameplay, with a legacy-safe fallback. */
export const getActiveMembers = (game: ProducerGameState): IdolMember[] => {
  const activeIds = game.activeMemberIds ?? game.members.filter((member) => member.joined).map((member) => member.id);
  return activeIds.slice(0, 4).map((id) => game.members.find((member) => member.id === id && member.joined)).filter((member): member is IdolMember => !!member);
};
