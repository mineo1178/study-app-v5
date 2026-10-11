import { collection, doc, getDocFromServer, runTransaction, type Firestore } from "firebase/firestore";

export const MAX_CALCULATION_SECONDS = 4 * 60 * 60;
export const getCalculationElapsedSeconds = (baseSeconds: number, startedMonotonic: number, nowMonotonic: number) =>
  Math.min(MAX_CALCULATION_SECONDS, baseSeconds + Math.max(0, Math.floor((nowMonotonic - startedMonotonic) / 1000)));
export type CalculationDraft = { id: string; dateKey: string; score: number; elapsedSeconds: number; startedAt: number; finishedAt: number; taskId?: string; taskLabel?: string };
export type CalculationAttempt = CalculationDraft & { attemptNo: number; maxScore: 7; attemptType: "first" | "redo"; createdAt: number };
export type CalculationDay = { dateKey: string; attemptCount: number; firstScore: number; firstElapsedSeconds: number; latestScore: number; latestElapsedSeconds: number; bestScore: number; latestAttemptId: string };
export const getJstDateKey = (at = Date.now()) => new Date(at + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
export const calculationStorageKey = (familyId: string, uid: string, dateKey: string) => `study-app-v5-${familyId}-${uid}-calculation-${dateKey}`;
export const getCalculationDays = (db: Firestore, familyId: string, uid: string) => collection(db, "families", familyId, "dailyCalculations", uid, "days");
export const getCalculationAttempts = (db: Firestore, familyId: string, uid: string, dateKey: string) => collection(doc(getCalculationDays(db, familyId, uid), dateKey), "attempts");
export const validateCalculationDraft = (draft: CalculationDraft) => {
  if (!draft.id || draft.id.includes("/") || !Number.isInteger(draft.score) || draft.score < 0 || draft.score > 7 ||
    !Number.isInteger(draft.elapsedSeconds) || draft.elapsedSeconds < 0 || draft.elapsedSeconds > MAX_CALCULATION_SECONDS ||
    !Number.isFinite(draft.startedAt) || !Number.isFinite(draft.finishedAt) || draft.startedAt < 0 || draft.finishedAt < draft.startedAt ||
    draft.dateKey !== getJstDateKey(draft.startedAt) ||
    (draft.taskId !== undefined && (typeof draft.taskId !== "string" || !draft.taskId || draft.taskId.includes("/") || draft.taskId.length > 200)) ||
    (draft.taskLabel !== undefined && (typeof draft.taskLabel !== "string" || !draft.taskId || !draft.taskLabel || draft.taskLabel.length > 300))) throw new Error("計算の記録を確認してね。");
};
export const summarizeCalculation = (previous: CalculationDay | undefined, attempt: CalculationAttempt): CalculationDay => ({
  dateKey: attempt.dateKey, attemptCount: attempt.attemptNo,
  firstScore: previous?.firstScore ?? attempt.score, firstElapsedSeconds: previous?.firstElapsedSeconds ?? attempt.elapsedSeconds,
  latestScore: attempt.score, latestElapsedSeconds: attempt.elapsedSeconds,
  bestScore: Math.max(previous?.bestScore ?? 0, attempt.score), latestAttemptId: attempt.id,
});
export const calculationDayState = (day?: CalculationDay) => !day ? "未実施" : day.latestScore === 7 ? "今日の計算 完了" : day.attemptCount === 1 ? "初回済み" : "解き直し中";
export const calculationAttemptLabel = (number: number) => number === 1 ? "1回目" : `解き直し${number - 1}回目`;
export const formatCalculationTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export const commitCalculationAttempt = async (db: Firestore, familyId: string, uid: string, draft: CalculationDraft) => {
  validateCalculationDraft(draft);
  const dayRef = doc(getCalculationDays(db, familyId, uid), draft.dateKey);
  const attemptRef = doc(getCalculationAttempts(db, familyId, uid, draft.dateKey), draft.id);
  let observedCount = -1;
  const commit = () => runTransaction(db, async (transaction) => {
    const [daySnapshot, existing] = await Promise.all([transaction.get(dayRef), transaction.get(attemptRef)]);
    if (existing.exists()) return existing.data() as CalculationAttempt;
    const previous = daySnapshot.exists() ? daySnapshot.data() as CalculationDay : undefined;
    observedCount = previous?.attemptCount ?? 0;
    const attemptNo = (previous?.attemptCount ?? 0) + 1;
    const attempt: CalculationAttempt = { ...draft, maxScore: 7, attemptNo, attemptType: attemptNo === 1 ? "first" : "redo", createdAt: Date.now() };
    transaction.set(attemptRef, attempt);
    transaction.set(dayRef, summarizeCalculation(previous, attempt));
    return attempt;
  });
  // Rules can reject a stale sequence before the emulator reports a transaction
  // conflict. Retry only when a server read proves another save advanced it.
  for (let retry = 0; ; retry++) {
    try { return await commit(); }
    catch (error) {
      if (retry >= 4 || (error as { code?: string }).code !== "permission-denied" || observedCount < 0) throw error;
      const latest = await getDocFromServer(dayRef);
      if ((latest.data()?.attemptCount ?? 0) <= observedCount) throw error;
    }
  }
};
