import type { IdolAbility, MemberDefinition, MemberId, ProducerGameState } from "../types";

export type GachaTicketType = "normal" | "silver" | "gold" | "premium";
export type GachaRarity = "N" | "R" | "SR" | "SSR";
export type GachaResultType = "member" | "item";
export type TicketBalances = Record<GachaTicketType, number>;
export type GachaPityState = { drawsSinceSrPlus: number; drawsSinceSsr: number };
export type TrainingItemDefinition = { id: string; name: string; ability: IdolAbility; rarity: GachaRarity; bonus: number };
export type GachaState = GachaPityState & { ticketBalances: TicketBalances; starFragments: number; itemInventory: Record<string, number>; usedItemIds?: string[] };
export type WeeklyGachaReward = { ticketType: GachaTicketType; quantity: number } | null;
export type GachaWeek = { weekId: string; targetMinutes: number; creditedMinutes: number; achievementRate: number; reward: WeeklyGachaReward; grantedAt: number };
export type GachaDraw = { drawId: string; ticketType: GachaTicketType; rarity: GachaRarity; resultType: GachaResultType; memberId?: MemberId; itemId?: string; itemQuantity?: number; duplicate: boolean; starFragmentsGained: number; pityApplied: "none" | "sr" | "ssr"; drawnAt: number };
export type GachaRandomRolls = { rarityRoll: number; categoryRoll: number; poolRoll: number };
export type GachaDrawResult = { game: ProducerGameState; gacha: GachaState; draw: GachaDraw };
export type GachaMemberDefinition = MemberDefinition & { sourceType: "gacha"; rarity: "R" | "SR" | "SSR" };
