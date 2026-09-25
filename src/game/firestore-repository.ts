import { collection, doc, type Firestore } from "firebase/firestore";

export type FirestoreRoot = readonly [string, string];

/** Shared refs for the existing idol-produce document hierarchy. */
export const createGameFirestoreRefs = (root: FirestoreRoot) => ({
  getGameDoc: (database: Firestore) => doc(database, ...root, "game", "idol-produce"),
  getRewardLedgerDoc: (database: Firestore, rewardKey: string) => doc(database, ...root, "rewardLedger", rewardKey),
  getPerformancesCol: (database: Firestore) => collection(database, ...root, "game", "idol-produce", "performances"),
  getPerformanceDoc: (database: Firestore, performanceId: string) => doc(database, ...root, "game", "idol-produce", "performances", performanceId),
});
