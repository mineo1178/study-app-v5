export type TestKind = "カリテ" | "組分け" | "判定";
const bonuses: Record<TestKind, [number, number, number]> = { カリテ: [3, 6, 10], 組分け: [5, 10, 15], 判定: [7, 14, 20] };
export const testImportance = (kind: TestKind) => ({ カリテ: 1, 組分け: 2, 判定: 3 })[kind];
export const getTestBoost = (kind: TestKind, improvement: number) => improvement >= 6 ? bonuses[kind][2] : improvement >= 4 ? bonuses[kind][1] : improvement >= 2 ? bonuses[kind][0] : 0;
export const getNextBonusGap = (improvement: number) => {
  const next = [2, 4, 6].find((threshold) => threshold > improvement);
  return next === undefined ? 0 : next - improvement;
};
