import type { IdolAbility, MemberStats } from "../types";
import type { GachaExchangeDefinition, GachaMemberDefinition, GachaRarity, GachaTicketType, TrainingItemDefinition } from "./types";

export const GACHA_FEATURE_START_DATE = new Date("2026-09-28T00:00:00+09:00").getTime();
export const GACHA_RATES: Record<GachaTicketType, Record<GachaRarity, number>> = {
  normal: { N: 75, R: 22, SR: 3, SSR: 0 }, silver: { N: 45, R: 40, SR: 14, SSR: 1 }, gold: { N: 15, R: 45, SR: 32, SSR: 8 }, premium: { N: 0, R: 30, SR: 50, SSR: 20 },
};
export const GACHA_CATEGORY_RATES: Record<GachaRarity, { member: number; item: number }> = { N: { member: 0, item: 100 }, R: { member: 60, item: 40 }, SR: { member: 70, item: 30 }, SSR: { member: 80, item: 20 } };
export const DUPLICATE_FRAGMENTS: Record<Exclude<GachaRarity, "N">, number> = { R: 10, SR: 30, SSR: 100 };
export const ITEM_BONUSES: Record<GachaRarity, number> = { N: 1, R: 2, SR: 3, SSR: 5 };
const stats = (primary: IdolAbility, secondary: IdolAbility, total: number): MemberStats => {
  const base: MemberStats = { vocal: 12, harmony: 12, dance: 12, character: 12, lyrics: 12, composition: 12, choreography: 12 };
  base[primary] += 5; base[secondary] += 4; const difference = total - Object.values(base).reduce((sum, value) => sum + value, 0); base.character += difference; return base;
};
const skill = (subject: "math" | "japanese" | "science" | "social", percent: number) => subject === "social" ? { id: "fan-maker" as const, name: "Fan Maker", description: `ライブ獲得ファン +${percent}%`, effect: { type: "live-fan-gain" as const, percent } } : { id: subject === "math" ? "perfect-pitch" as const : subject === "japanese" ? "heartful-words" as const : "perfect-step" as const, name: subject === "math" ? "Perfect Pitch" : subject === "japanese" ? "Heartful Words" : "Perfect Step", description: `${subject === "math" ? "歌唱" : subject === "japanese" ? "楽曲" : "ダンス"}系 +${percent}%`, effect: { type: "battle-category" as const, category: subject === "math" ? "vocal" as const : subject === "japanese" ? "song" as const : "dance" as const, percent } };
const member = (id: string, name: string, subjectType: "math" | "japanese" | "science" | "social", rarity: "R" | "SR" | "SSR", primary: IdolAbility, secondary: IdolAbility, total: number): GachaMemberDefinition => ({ id, name, subjectType, sourceType: "gacha", rarity, variantId: id, baseStats: stats(primary, secondary, total), leaderSkill: skill(subjectType, rarity === "R" ? 10 : rarity === "SR" ? 12 : 15) });
export const GACHA_MEMBER_DEFINITIONS: GachaMemberDefinition[] = [
  member("aoi-r", "アオイ", "math", "R", "vocal", "composition", 94), member("hina-r", "ヒナ", "japanese", "R", "harmony", "lyrics", 94), member("sora-r", "ソラ", "science", "R", "dance", "choreography", 94), member("mei-r", "メイ", "social", "R", "character", "harmony", 94),
  member("rei-sr", "レイ", "math", "SR", "vocal", "composition", 102), member("shiori-sr", "シオリ", "japanese", "SR", "harmony", "lyrics", 102), member("nao-sr", "ナオ", "science", "SR", "dance", "choreography", 102), member("koharu-sr", "コハル", "social", "SR", "character", "harmony", 102),
  member("sena-ssr", "セナ", "math", "SSR", "vocal", "composition", 110), member("rin-ssr", "リン", "japanese", "SSR", "harmony", "lyrics", 110), member("luna-ssr", "ルナ", "science", "SSR", "dance", "choreography", 110), member("yui-ssr", "ユイ", "social", "SSR", "character", "harmony", 110),
];
const itemNames: Record<IdolAbility, string> = { vocal: "ボーカルマイク", harmony: "ハーモニーイヤモニ", dance: "ダンスシューズ", character: "ステージバッジ", lyrics: "作詞ノート", composition: "作曲キーボード", choreography: "振付ノート" };
export const TRAINING_ITEMS: TrainingItemDefinition[] = (Object.keys(itemNames) as IdolAbility[]).flatMap((ability) => (["N", "R", "SR", "SSR"] as GachaRarity[]).map((rarity) => ({ id: `${ability}-${rarity.toLowerCase()}`, name: itemNames[ability], ability, rarity, bonus: ITEM_BONUSES[rarity] })));
export const GACHA_EXCHANGE_LINEUP: GachaExchangeDefinition[] = [
  { id: "gold-ticket", name: "GOLDチケット", description: "SR以上も狙えるガチャチケット", fragmentCost: 40, reward: { ticketType: "gold", quantity: 1 } },
  ...(Object.keys(itemNames) as IdolAbility[]).map((ability) => ({ id: `${ability}-item-r`, name: `${itemNames[ability]} R`, description: `${ability}を+2育成できるアイテム`, fragmentCost: 15, reward: { itemId: `${ability}-r`, quantity: 1 } })),
];
