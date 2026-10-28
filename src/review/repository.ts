import { collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query, runTransaction, where, type Firestore } from "firebase/firestore";
import { nextProgress, validateQuestion, validateWeakness, type Answer, type Draft, type Progress, type Question, type Weakness } from "./model";

export const reviewCollection = (db: Firestore, family: string, uid: string, name: "questions" | "weaknesses" | "attempts" | "progress") => collection(db, "families", family, "reviewUsers", uid, name);
export type ReviewData = { questions: Question[]; weaknesses: Weakness[]; progress: Progress[]; history: Answer[] };
export async function loadReview(db: Firestore, family: string, uid: string): Promise<ReviewData> {
  const [questions, weaknesses, progress, history] = await Promise.all([
    getDocsFromServer(query(reviewCollection(db, family, uid, "questions"), where("published", "==", true), limit(201))),
    getDocsFromServer(query(reviewCollection(db, family, uid, "weaknesses"), limit(101))),
    getDocsFromServer(query(reviewCollection(db, family, uid, "progress"), limit(201))),
    getDocsFromServer(query(reviewCollection(db, family, uid, "attempts"), orderBy("answeredAt", "desc"), limit(50))),
  ]);
  if (questions.size > 200 || weaknesses.size > 100 || progress.size > 200) throw new Error("初期版の表示上限（問題200・苦手100件）を超えています。保護者に確認してください。");
  const qs = questions.docs.map(d => d.data()); qs.forEach(validateQuestion);
  const ws = weaknesses.docs.map(d => d.data()); ws.forEach(validateWeakness);
  return { questions: qs as Question[], weaknesses: ws as Weakness[], progress: progress.docs.map(d => d.data() as Progress), history: history.docs.map(d => d.data() as Answer) };
}
export async function saveReview(db: Firestore, family: string, uid: string, draft: Draft, active = () => true) {
  if (draft.uid !== uid || !draft.finishedAt || draft.answers.length !== draft.questions.length || draft.answers.length < 1 || draft.answers.length > 5) throw new Error("回答が完了していません。");
  // One bounded two-write transaction per answer avoids the 20-access batch limit.
  // The stable attempt IDs make partial failures and concurrent retries idempotent.
  for (const answer of draft.answers) {
    if (!active()) throw new Error("利用者が切り替わりました。");
    const attemptRef = doc(reviewCollection(db, family, uid, "attempts"), answer.id);
    const progressRef = doc(reviewCollection(db, family, uid, "progress"), answer.questionId);
    const questionRef = doc(reviewCollection(db, family, uid, "questions"), answer.questionId);
    let observedCount = -1;
    const commit = () => runTransaction(db, async transaction => {
      const existing = await transaction.get(attemptRef);
      if (existing.exists()) {
        const saved = existing.data() as Answer;
        if (["uid", "questionId", "questionVersion", "selectedIndex", "answeredAt"].some(key => saved[key as keyof Answer] !== answer[key as keyof Answer])) throw new Error("保存済みの回答と一致しません。");
        return;
      }
      const [progress, question] = await Promise.all([transaction.get(progressRef), transaction.get(questionRef)]);
      observedCount = progress.data()?.count ?? 0;
      if (!active()) throw new Error("利用者が切り替わりました。");
      if (!question.exists() || question.data().version !== answer.questionVersion) throw new Error("問題が編集されています。保存できた回答は保持されています。ホームに戻り、新しい問題で始めてください。");
      transaction.set(attemptRef, answer);
      transaction.set(progressRef, nextProgress(progress.exists() ? progress.data() as Progress : undefined, answer));
    });
    // As in calculation saves, Rules may reject a stale pair before the SDK
    // reports a transaction conflict. Retry only on proven concurrent progress.
    for (let retry = 0; ; retry++) {
      try { await commit(); break; }
      catch (error) {
        if (!active() || retry >= 4 || observedCount < 0 || (error as { code?: string }).code !== "permission-denied") throw error;
        const latest = await getDocFromServer(progressRef);
        if ((latest.data()?.count ?? 0) <= observedCount) throw error;
      }
    }
  }
}
