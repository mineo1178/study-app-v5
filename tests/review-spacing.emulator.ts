import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore, terminate, writeBatch } from "firebase/firestore";
import { answerQuestion, getJstDay, jstDayNumber, jstMidnight, nextProgress, sampleQuestions, type Draft, type Progress } from "../src/review/model";
import { loadReview, reviewCollection, saveReview } from "../src/review/repository";
import { seedFamily, seedReviewData } from "./emulator-admin";
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator required");
const app = initializeApp({ projectId: "demo-study-v182", apiKey: "emulator-only" }, crypto.randomUUID()), db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", Number(endpoint.split(":")[1]), { mockUserToken: { sub: "child" } });
const family = "spacing-" + Date.now(), uid = "child";
const q = { ...sampleQuestions[0], id: "spacing" }, oldq = { ...q, id: "legacy" };
const col = (name: "attempts" | "progress") => reviewCollection(db, family, uid, name);
const baseDay = jstDayNumber(Date.now()) - 90;
function draft(id: string, day: number, correct = true, mode: Draft["mode"] = "daily", question = q) {
  const at = jstMidnight(baseDay + day) + 3600000;
  const d: Draft = { id, uid, questions: [question], mode, startedAt: at, questionStartedAt: at, answers: [], finishedAt: null };
  return answerQuestion(d, correct ? question.correctIndex : 0, at + 1000);
}
describe("spaced review Rules and legacy data", () => {
  beforeAll(async () => { await seedFamily(family, [uid]); await seedReviewData(family, uid, "questions", [q, oldq]); });
  afterAll(async () => { await terminate(db); await deleteApp(app); });
  const read = async (id = q.id) => (await getDocFromServer(doc(col("progress"), id))).data() as Progress;
  it("persists wrong -> same-day correct -> 3/7/14-day reviews with strict paired Rules", async () => {
    for (const [id, day, correct, mode, stage, due] of [
      ["wrong", 0, false, "daily", 0, 1], ["retry", 0, true, "retry", 0, 1],
      ["next", 1, true, "daily", 1, 4], ["seven", 4, true, "daily", 2, 11],
      ["fourteen", 11, true, "daily", 3, 25], ["reset", 25, false, "daily", 0, 26],
    ] as const) {
      const d = draft(id, day, correct, mode); await saveReview(db, family, uid, d); await saveReview(db, family, uid, d);
      const p = await read(); expect(p.reviewStage).toBe(stage); expect(p.nextAt).toBe(jstMidnight(baseDay + due));
    }
    expect((await read()).count).toBe(6);
    expect((await loadReview(db, family, uid)).history).toHaveLength(6);
  });
  it("concurrent replay is idempotent, old arrival preserves schedule and history", async () => {
    const d = draft("concurrent", 26);
    await Promise.all([saveReview(db, family, uid, d), saveReview(db, family, uid, d)]);
    const before = await read(); await saveReview(db, family, uid, draft("late", 2, false));
    expect(await read()).toMatchObject({ count: before.count + 1, nextAt: before.nextAt, reviewStage: before.reviewStage, reviewDay: before.reviewDay });
  });
  it("rejects forged spacing, unpaired writes and schema downgrades", async () => {
    const d = draft("forged-spacing", 30), a = d.answers[0], previous = await read(), expected = nextProgress(previous, a);
    for (const patch of [{ reviewStage: 3 }, { reviewDay: 1 }, { nextAt: a.answeredAt }, { privateExtra: "forbidden" }]) {
      const b = writeBatch(db); b.set(doc(col("attempts"), a.id), a); b.set(doc(col("progress"), q.id), { ...expected, ...patch });
      await expect(b.commit()).rejects.toMatchObject({ code: "permission-denied" });
    }
    const { reviewStage: _s, reviewDay: _d, ...legacy } = expected; void _s; void _d;
    legacy.nextAt = a.answeredAt + 259200000;
    const b = writeBatch(db); b.set(doc(col("attempts"), a.id), a); b.set(doc(col("progress"), q.id), legacy);
    await expect(b.commit()).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("accepts original v1 shape until upgrade, then upgrades conservatively without rewriting attempts", async () => {
    const d = draft("legacy-first", 0, false, "daily", oldq), a = d.answers[0];
    const { reviewStage: _s, reviewDay: _d, ...legacy } = nextProgress(undefined, a); void _s; void _d; legacy.nextAt = a.answeredAt;
    const b = writeBatch(db); b.set(doc(col("attempts"), a.id), a); b.set(doc(col("progress"), oldq.id), legacy); await b.commit();
    await saveReview(db, family, uid, draft("legacy-upgrade", 1, true, "daily", oldq));
    expect(await read(oldq.id)).toMatchObject({ count: 2, firstCorrect: false, reviewStage: 1, nextAt: jstMidnight(baseDay + 4) });
    expect((await getDocFromServer(doc(col("attempts"), a.id))).data()).toEqual(a);
    expect(getJstDay((await read(oldq.id)).nextAt)).toBe(getJstDay(jstMidnight(baseDay + 4)));
  });
});
