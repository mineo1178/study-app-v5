import { GACHA_CATEGORY_RATES, GACHA_EXCHANGE_LINEUP, GACHA_FEATURE_START_DATE, GACHA_MEMBER_DEFINITIONS, GACHA_RATES, TRAINING_ITEMS, DUPLICATE_FRAGMENTS } from "./config";
import type { GachaDraw, GachaDrawResult, GachaExchange, GachaExchangeDefinition, GachaRandomRolls, GachaRarity, GachaResultType, GachaState, GachaTicketType, WeeklyGachaReward } from "./types";
import type { IdolAbility, IdolMember, MemberId, ProducerGameState } from "../types";

export const emptyTicketBalances = () => ({ normal: 0, silver: 0, gold: 0, premium: 0 });
export const normalizeGachaState = (saved?: Partial<GachaState>): GachaState => ({ ticketBalances: { ...emptyTicketBalances(), ...(saved?.ticketBalances ?? {}) }, starFragments: Math.max(0, saved?.starFragments ?? 0), drawsSinceSrPlus: Math.max(0, saved?.drawsSinceSrPlus ?? 0), drawsSinceSsr: Math.max(0, saved?.drawsSinceSsr ?? 0), itemInventory: { ...(saved?.itemInventory ?? {}) }, usedItemIds: saved?.usedItemIds ?? [] });
export const normalizeGachaDraw = (saved: Partial<GachaDraw> & { drawId: string }): GachaDraw => ({ drawId: saved.drawId, ticketType: saved.ticketType ?? "normal", rarity: saved.rarity ?? "N", resultType: saved.resultType ?? (saved.memberId ? "member" : "item"), memberId: saved.memberId, itemId: saved.itemId, itemQuantity: saved.itemQuantity, duplicate: saved.duplicate ?? false, starFragmentsGained: saved.starFragmentsGained ?? 0, pityApplied: saved.pityApplied ?? "none", drawnAt: saved.drawnAt ?? 0 });
export const createSampleGachaState = (): GachaState => normalizeGachaState({ ticketBalances: { normal: 2, silver: 2, gold: 2, premium: 2 }, starFragments: 70, itemInventory: { "vocal-n": 1 } });
export const createSampleGachaDraws = (): GachaDraw[] => [
  { drawId: "sample-member", ticketType: "gold", rarity: "SR", resultType: "member", memberId: "rei-sr", duplicate: false, starFragmentsGained: 0, pityApplied: "none", drawnAt: 3 },
  { drawId: "sample-item", ticketType: "silver", rarity: "R", resultType: "item", itemId: "dance-r", itemQuantity: 1, duplicate: false, starFragmentsGained: 0, pityApplied: "none", drawnAt: 2 },
  { drawId: "sample-duplicate", ticketType: "normal", rarity: "R", resultType: "member", memberId: "aoi-r", duplicate: true, starFragmentsGained: 10, pityApplied: "none", drawnAt: 1 },
];
export const calculateWeeklyGachaReward = (achievementRate: number, weekEndAt: number): WeeklyGachaReward => {
  if (weekEndAt < GACHA_FEATURE_START_DATE) return null;
  const percent = achievementRate * 100;
  if (percent < 50) return null; if (percent < 70) return { ticketType: "normal", quantity: 1 }; if (percent < 90) return { ticketType: "normal", quantity: 2 }; if (percent < 100) return { ticketType: "silver", quantity: 1 }; if (percent < 120) return { ticketType: "gold", quantity: 1 }; return { ticketType: "premium", quantity: 1 };
};
export const getNextTicketThreshold = (actualMinutes: number, targetMinutes: number) => {
  const rate = targetMinutes ? actualMinutes / targetMinutes : 0; const percent = Math.floor(rate * 100); const next = percent < 50 ? 50 : percent < 70 ? 70 : percent < 90 ? 90 : percent < 100 ? 100 : percent < 120 ? 120 : null;
  return { achievementRate: rate, currentPercent: percent, minutesToNext: next === null ? 0 : Math.max(0, Math.ceil(targetMinutes * next / 100 - actualMinutes)), nextPercent: next, currentReward: calculateWeeklyGachaReward(rate, GACHA_FEATURE_START_DATE) };
};
export const validateRateTables = () => Object.values(GACHA_RATES).every((rates) => Object.values(rates).reduce((sum, rate) => sum + rate, 0) === 100) && Object.values(GACHA_CATEGORY_RATES).every((rates) => rates.member + rates.item === 100);
export const resolveGachaRarity = (ticketType: GachaTicketType, pity: Pick<GachaState, "drawsSinceSrPlus" | "drawsSinceSsr">, roll: number): { rarity: GachaRarity; pityApplied: GachaDraw["pityApplied"] } => {
  if (pity.drawsSinceSsr >= 19) return { rarity: "SSR", pityApplied: "ssr" }; if (pity.drawsSinceSrPlus >= 9) return roll < .5 ? { rarity: "SR", pityApplied: "sr" } : { rarity: "SSR", pityApplied: "sr" };
  let remaining = Math.min(.999999, Math.max(0, roll)) * 100; for (const rarity of ["N", "R", "SR", "SSR"] as GachaRarity[]) { remaining -= GACHA_RATES[ticketType][rarity]; if (remaining < 0) return { rarity, pityApplied: "none" }; } return { rarity: "SSR", pityApplied: "none" };
};
export const resolveGachaCategory = (rarity: GachaRarity, roll: number): GachaResultType => roll * 100 < GACHA_CATEGORY_RATES[rarity].member ? "member" : "item";
export const resolveGachaPoolEntry = (rarity: GachaRarity, resultType: GachaResultType, roll: number): typeof GACHA_MEMBER_DEFINITIONS[number] | typeof TRAINING_ITEMS[number] => {
  const pool = resultType === "member" ? GACHA_MEMBER_DEFINITIONS.filter((member) => member.rarity === rarity) : TRAINING_ITEMS.filter((item) => item.rarity === rarity);
  if (!pool.length) return resolveGachaPoolEntry(rarity, "item", roll);
  return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(.999999, roll)) * pool.length))];
};
export const applyGachaPity = (state: GachaState, rarity: GachaRarity): GachaState => rarity === "SSR" ? { ...state, drawsSinceSsr: 0, drawsSinceSrPlus: 0 } : rarity === "SR" ? { ...state, drawsSinceSrPlus: 0, drawsSinceSsr: state.drawsSinceSsr + 1 } : { ...state, drawsSinceSrPlus: state.drawsSinceSrPlus + 1, drawsSinceSsr: state.drawsSinceSsr + 1 };
export const calculateDuplicateFragments = (rarity: GachaRarity) => rarity === "N" ? 0 : DUPLICATE_FRAGMENTS[rarity];
export const grantWeeklyGachaReward = (state: GachaState, reward: WeeklyGachaReward) => !reward ? state : { ...state, ticketBalances: { ...state.ticketBalances, [reward.ticketType]: state.ticketBalances[reward.ticketType] + reward.quantity } };
export const resolveGachaDraw = (game: ProducerGameState, state: GachaState, drawId: string, ticketType: GachaTicketType, rolls: GachaRandomRolls, drawnAt = Date.now()): GachaDrawResult | null => {
  if (state.ticketBalances[ticketType] < 1) return null;
  const { rarity, pityApplied } = resolveGachaRarity(ticketType, state, rolls.rarityRoll); const preferredCategory = resolveGachaCategory(rarity, rolls.categoryRoll); const resultType = preferredCategory === "member" && !GACHA_MEMBER_DEFINITIONS.some((member) => member.rarity === rarity) ? "item" : preferredCategory; const entry = resolveGachaPoolEntry(rarity, resultType, rolls.poolRoll);
  let nextGame = game; let duplicate = false; let fragments = 0; let itemId: string | undefined; let memberId: string | undefined; let nextState = applyGachaPity({ ...state, ticketBalances: { ...state.ticketBalances, [ticketType]: state.ticketBalances[ticketType] - 1 } }, rarity);
  if (resultType === "member") { memberId = entry.id; duplicate = game.members.some((member) => member.id === entry.id); fragments = duplicate ? calculateDuplicateFragments(rarity) : 0; if (duplicate) nextState = { ...nextState, starFragments: nextState.starFragments + fragments }; else { const definition = entry as typeof GACHA_MEMBER_DEFINITIONS[number]; const member: IdolMember = { id: definition.id, name: definition.name, specialty: `${definition.subjectType}タイプ・${definition.rarity}`, joined: true, joinedAt: drawnAt, abilities: { ...definition.baseStats } }; nextGame = { ...game, members: [...game.members, member] }; } } else { itemId = entry.id; nextState = { ...nextState, itemInventory: { ...nextState.itemInventory, [entry.id]: (nextState.itemInventory[entry.id] ?? 0) + 1 } }; }
  const draw: GachaDraw = { drawId, ticketType, rarity, resultType, memberId, itemId, itemQuantity: itemId ? 1 : undefined, duplicate, starFragmentsGained: fragments, pityApplied, drawnAt };
  return { game: nextGame, gacha: nextState, draw };
};
export const applyTrainingItem = (game: ProducerGameState, state: GachaState, itemId: string, memberId: MemberId, itemUseId = ""): { game: ProducerGameState; gacha: GachaState } | null => {
  const item = TRAINING_ITEMS.find((candidate) => candidate.id === itemId); const member = game.members.find((candidate) => candidate.id === memberId && candidate.joined); if (!item || !member || (state.itemInventory[itemId] ?? 0) < 1 || (itemUseId && state.usedItemIds?.includes(itemUseId))) return null;
  return { game: { ...game, members: game.members.map((candidate) => candidate.id === memberId ? { ...candidate, abilities: { ...candidate.abilities, [item.ability]: candidate.abilities[item.ability] + item.bonus } } : candidate) }, gacha: { ...state, itemInventory: { ...state.itemInventory, [itemId]: state.itemInventory[itemId] - 1 }, usedItemIds: itemUseId ? [...(state.usedItemIds ?? []), itemUseId].slice(-100) : state.usedItemIds } };
};
export const exchangeStarFragments = (state: GachaState, exchangeInput: string | GachaExchangeDefinition, exchangeId: string, selectedStat?: IdolAbility, exchangedAt = Date.now(), existingExchange?: GachaExchange): { gacha: GachaState; exchange: GachaExchange } | null => {
  if (existingExchange) return { gacha: state, exchange: existingExchange };
  const exchange = GACHA_EXCHANGE_LINEUP.find((candidate) => candidate.id === (typeof exchangeInput === "string" ? exchangeInput : exchangeInput.id));
  if (!exchange || (exchange.reward.itemId && (!selectedStat || exchange.reward.itemId !== `${selectedStat}-${exchange.reward.itemId.split("-").at(-1)}`))) return null;
  if (!exchangeId || state.starFragments < exchange.fragmentCost) return null;
  const ticketBalances = { ...state.ticketBalances };
  const itemInventory = { ...state.itemInventory };
  if (exchange.reward.ticketType) ticketBalances[exchange.reward.ticketType] += exchange.reward.quantity;
  if (exchange.reward.itemId) itemInventory[exchange.reward.itemId] = (itemInventory[exchange.reward.itemId] ?? 0) + exchange.reward.quantity;
  return { gacha: { ...state, starFragments: state.starFragments - exchange.fragmentCost, ticketBalances, itemInventory }, exchange: { exchangeId, exchangeItemId: exchange.id, fragmentCost: exchange.fragmentCost, reward: exchange.reward, exchangedAt } };
};
export const findGachaExchange = (exchangeItemId: string) => GACHA_EXCHANGE_LINEUP.find((exchange) => exchange.id === exchangeItemId);
