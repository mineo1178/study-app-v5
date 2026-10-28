import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocsFromServer, getFirestore, setDoc, terminate, updateDoc, where, query, writeBatch } from "firebase/firestore";
import { answerQuestion, nextProgress, sampleQuestions, type Draft, type Progress } from "../src/review/model";
import { loadReview, reviewCollection, saveReview } from "../src/review/repository";
import { seedFamily, seedReviewData } from "./emulator-admin";
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator required");
const family = `review-${Date.now()}`, uid = "review-a";
const client = (id?: string) => { const app = initializeApp({ projectId: "demo-study-v182", apiKey: "emulator-only" }, crypto.randomUUID()); const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", Number(endpoint.split(":")[1]), id ? { mockUserToken: { sub: id } } : undefined); return { app, db }; };
const manager = client("review-parent"), a = client(uid), twin = client(uid), b = client("review-b"), outside = client("review-outsider"), anon = client();
const col = (name: Parameters<typeof reviewCollection>[3], who = a, owner = uid, f = family) => reviewCollection(who.db, f, owner, name);
const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "permission-denied" });
function complete(id: string, correct: boolean, count = 5, at = Date.now() - 10000): Draft { let d: Draft = { id, uid, questions: sampleQuestions.slice(0, count), mode: "daily", startedAt: at, questionStartedAt: at, answers: [], finishedAt: null }; for (const q of d.questions) d = answerQuestion(d, correct ? q.correctIndex : (q.correctIndex + 1) % 4, d.questionStartedAt + 100); return d; }
describe("review rules and emulator persistence", () => {
  beforeAll(async () => { await seedFamily(family, [uid, "review-b", "review-parent"]); await seedReviewData(family, uid, "questions", sampleQuestions); });
  afterAll(async () => { await Promise.all([manager, a, twin, b, outside, anon].map(async c => { await terminate(c.db); await deleteApp(c.app); })); });
  it("saves five answers with paired progress within Rules access limits; reload and idempotent retry", async () => {
    const d = complete("all-wrong", false);
    await saveReview(a.db, family, uid, d); await saveReview(a.db, family, uid, d);
    const loaded = await loadReview(twin.db, family, uid);
    expect(loaded.history).toHaveLength(5); expect(loaded.progress.every(p => p.count === 1 && !p.latestCorrect)).toBe(true);
    expect(loaded.questions).toHaveLength(5);
    const redo = { ...complete("all-correct", true), mode: "retry" as const };
    redo.answers = redo.answers.map(a => ({ ...a, mode: "retry" }));
    await saveReview(a.db, family, uid, redo);
    const after = await loadReview(twin.db, family, uid);
    expect(after.history).toHaveLength(10); expect(after.progress.every(p => p.count === 2 && p.latestCorrect && !p.firstCorrect && p.latestMode === "retry")).toBe(true);
  });
  it("preserves newer progress when an older offline answer arrives", async () => {
    await saveReview(a.db, family, uid, complete("old-offline", false, 1, 1000));
    const p = (await getDocFromServer(doc(col("progress"), "sample-0"))).data();
    expect(p).toMatchObject({ count: 3, latestCorrect: true, recordedAttemptId: "old-offline_0" });
  });
  it("concurrent duplicate saves and two devices never duplicate or lose history", async () => {
    const d = complete("duplicate", true, 1);
    await Promise.all([saveReview(a.db, family, uid, d), saveReview(twin.db, family, uid, d)]);
    await Promise.all([saveReview(a.db, family, uid, complete("device-a", false, 1)), saveReview(twin.db, family, uid, complete("device-b", true, 1))]);
    expect((await getDocFromServer(doc(col("progress"), "sample-0"))).data()?.count).toBe(6);
  });
  it("rejects fabricated grading, forged UID, future dates and unpaired writes", async () => {
    const answer = complete("forged", true, 1).answers[0];
    for (const patch of [{ correct: false }, { uid: "review-b" }, { answeredAt: Date.now() + 86400000 }, { questionVersion: "wrong-version" }, { prompt: "forged" }, { selectedIndex: 4 }, { elapsedMs: -1 }, { unexpected: true }]) {
      const batch = writeBatch(a.db), forged = { ...answer, ...patch };
      batch.set(doc(col("attempts"), answer.id), forged);
      batch.set(doc(col("progress"), answer.questionId), nextProgress((await getDocFromServer(doc(col("progress"), answer.questionId))).data() as Progress, forged));
      await denied(batch.commit());
    }
    await denied(setDoc(doc(col("attempts"), answer.id), answer));
    await denied(updateDoc(doc(col("progress"), "sample-0"), { count: 999 }));
    await denied(deleteDoc(doc(col("attempts"), "all-wrong_0")));
    await denied(updateDoc(doc(col("attempts"), "all-wrong_0"), { correct: true }));
    await denied(deleteDoc(doc(col("progress"), "sample-0")));
  });
  it("resumes a partially saved session after invalidation without duplicate records", async () => {
    const d = complete("partial-retry", true);
    let checks = 0;
    await expect(saveReview(a.db, family, uid, d, () => ++checks < 3)).rejects.toThrow("切り替わり");
    expect((await loadReview(a.db, family, uid)).history.filter(a => a.sessionId === d.id)).toHaveLength(1);
    await saveReview(a.db, family, uid, d);
    expect((await loadReview(twin.db, family, uid)).history.filter(a => a.sessionId === d.id)).toHaveLength(5);
  });
  it("enforces own UID and family membership on every new collection, including queries", async () => {
    for (const who of [b, outside, anon]) for (const name of ["questions", "weaknesses", "attempts", "progress"] as const) {
      await denied(getDocsFromServer(col(name, who)));
      await denied(getDocFromServer(doc(col(name, who), "sample-0")));
      await denied(setDoc(doc(col(name, who), "sample-0"), sampleQuestions[0]));
    }
    await denied(getDocsFromServer(col("questions", a, uid, "unrelated-family")));
    expect((await getDocsFromServer(query(col("questions", b, "review-b"), where("published", "==", true)))).empty).toBe(true);
  });
  it("validates manual registration/edit/import data and preserves old answer snapshots", async () => {
    for (const patch of [{ choices: ["a", "a", "b", "c"] }, { correctIndex: 4 }, { prompt: " " }, { prompt: "x".repeat(1001) }, { subject: "invalid" }, { extra: "x" }]) await denied(setDoc(doc(col("questions", manager), "sample-0"), { ...sampleQuestions[0], version: crypto.randomUUID(), ...patch }));
    const q = { ...sampleQuestions[0], version: crypto.randomUUID(), prompt: "編集後\n確認" };
    await seedReviewData(family, uid, "questions", [q]);
    expect((await getDocFromServer(doc(col("attempts"), "all-wrong_0"))).data()?.prompt).toBe(sampleQuestions[0].prompt);
    await expect(saveReview(a.db, family, uid, complete("stale-version", true, 1))).rejects.toThrow("編集");
    await denied(setDoc(doc(col("questions", manager), q.id), { ...q, explanation: "same version forbidden" }));
    await denied(deleteDoc(doc(col("questions", manager), q.id)));
    const w = { id: "weak", subject: "math" as const, unit: "保護者確認", mistake: "確認した内容", point: "再確認", testKind: "カリテ", questionIds: [q.id] };
    await seedReviewData(family, uid, "weaknesses", [w]);
    await seedReviewData(family, uid, "weaknesses", [{ ...w, point: "追記" }]);
    for (const patch of [{ point: "" }, { subject: "invalid" }, { questionIds: [123] }, { questionIds: Array(6).fill("x") }, { uid: "review-b" }]) await denied(setDoc(doc(col("weaknesses", manager), w.id), { ...w, ...patch }));
    const items = Array.from({ length: 50 }, (_, i) => ({ ...sampleQuestions[1], id: `batch-${i}`, version: crypto.randomUUID() }));
    await seedReviewData(family, uid, "questions", items);
    await seedReviewData(family, uid, "questions", items); // lost-response retry uses the same IDs/version
    expect((await getDocsFromServer(query(col("questions"), where("published", "==", true)))).size).toBe(55);
  });
  it("does not touch tests, tasks or game rewards and stops invalidated sessions", async () => {
    await expect(saveReview(a.db, family, uid, complete("inactive", true, 1), () => false)).rejects.toThrow("切り替わり");
    for (const name of ["tasks", "tests", "rewardLedger"]) expect((await getDocsFromServer(collection(a.db, "families", family, name))).empty).toBe(true);
    await seedFamily(family, ["review-b"]);
    await denied(loadReview(a.db, family, uid));
  });
});
