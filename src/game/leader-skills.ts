import { MEMBER_DEFINITIONS } from "./config";
import type { FormationSnapshot, LeaderSkillDefinition, MemberId, ProducerGameState } from "./types";

export const getLeaderSkill = (game: ProducerGameState): LeaderSkillDefinition | null => MEMBER_DEFINITIONS.find((member) => member.id === game.leaderMemberId)?.leaderSkill ?? null;
export const setLeader = (game: ProducerGameState, memberId: MemberId): ProducerGameState => game.activeMemberIds?.includes(memberId) ? { ...game, leaderMemberId: memberId } : game;
export const applyLeaderSkillToBattleStats = (game: ProducerGameState, stats: Record<"vocal" | "dance" | "song" | "character", number>) => { const skill = getLeaderSkill(game); if (!skill || skill.effect.type !== "battle-category") return stats; const category = skill.effect.category; return { ...stats, [category]: Math.floor(stats[category] * (1 + skill.effect.percent / 100)) }; };
export const applyLeaderSkillToLiveFanGain = (game: ProducerGameState, fanGain: number) => { const skill = getLeaderSkill(game); if (!skill || skill.effect.type !== "live-fan-gain") return { baseFanGain: fanGain, bonusFanGain: 0, finalFanGain: fanGain, skillId: null }; const bonusFanGain = Math.floor(fanGain * skill.effect.percent / 100); return { baseFanGain: fanGain, bonusFanGain, finalFanGain: fanGain + bonusFanGain, skillId: skill.id }; };
export const getFormationSnapshot = (game: ProducerGameState): FormationSnapshot => ({ activeMemberIds: [...(game.activeMemberIds ?? game.members.filter((member) => member.joined).map((member) => member.id))], leaderMemberId: game.leaderMemberId ?? null, leaderSkillId: getLeaderSkill(game)?.id ?? null });
export const getLeaderRecommendation = (game: ProducerGameState) => {
  const skill = getLeaderSkill(game);
  if (!skill) return "活動メンバーからリーダーを選ぼう";
  return skill.effect.type === "live-fan-gain" ? `${skill.name}でライブのファンを+${skill.effect.percent}%` : `${skill.name}で対バンの${({ vocal: "歌唱", dance: "ダンス", song: "楽曲" } as const)[skill.effect.category]}を+${skill.effect.percent}%`;
};
