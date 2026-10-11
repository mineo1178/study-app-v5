import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { collection, connectFirestoreEmulator, deleteDoc, disableNetwork, doc, enableNetwork, getDocFromServer, getDocsFromServer, getFirestore, setDoc, terminate, updateDoc, writeBatch } from "firebase/firestore";
import { commitCalculationAttempt, getCalculationAttempts, getCalculationDays, getJstDateKey, summarizeCalculation, type CalculationAttempt, type CalculationDraft } from "../src/daily-calculation";
import { commitStudySessionOperation, type SessionTask, type StudySessionOperation } from "../src/study-session";
import { getSessionActivityPoints } from "../src/game/rewards";
import { seedFamily } from "./emulator-admin";
import { calculationAttemptTrend, calculationStartLabel, calculationTaskRecords } from "../src/daily-calculation-view";

const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator endpoint required");
const familyId = `calculation-${Date.now()}`;
const makeClient = (uid?: string) => {
  const app = initializeApp({ projectId: "demo-study-v182", apiKey: "emulator-only" }, `calc-${uid ?? "anon"}-${crypto.randomUUID()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", Number(endpoint.split(":")[1]), uid ? { mockUserToken: { sub: uid } } : undefined);
  return { app, db };
};
const a = makeClient("calc-member"), b = makeClient("calc-member"), otherUid = makeClient("calc-other"), outsider = makeClient("outsider"), anon = makeClient();
const draft = (id: string, overrides: Partial<CalculationDraft> = {}): CalculationDraft => ({ id, dateKey: getJstDateKey(1000), score: 3, elapsedSeconds: 260, startedAt: 1000, finishedAt: 261000, ...overrides });
const denied = (work: Promise<unknown>) => expect(work).rejects.toMatchObject({ code: "permission-denied" });
const attemptDoc = (client: typeof a, id: string) => doc(getCalculationAttempts(client.db, familyId, "calc-member", getJstDateKey(1000)), id);
const save = (client: typeof a, id: string, overrides: Partial<CalculationDraft> = {}) => commitCalculationAttempt(client.db, familyId, "calc-member", draft(id, overrides));
const task = (id: string): SessionTask => ({ id, unit: "1", subject: "math", status: "in_progress", isRunning: true, currentDuration: 0, sessionStartTime: 1000, lastUserActivityAt: 1000, sessionId: `session-${id}`, history: [] });
const studyOperation = (current: SessionTask, kind: StudySessionOperation["kind"], overrides: Partial<StudySessionOperation> = {}): StudySessionOperation => ({ taskId: current.id, sessionId: current.sessionId!, operationId: crypto.randomUUID(), kind, at: 901000, ...overrides });
const taskRef = (client: typeof a, id: string) => doc(client.db, "families", familyId, "tasks", id);
const study = (client: typeof a, operation: StudySessionOperation) => commitStudySessionOperation(client.db, collection(client.db, "families", familyId, "tasks"), operation);

describe("calculation append-only Rules and review transactions", () => {
  beforeAll(async () => { await seedFamily(familyId, ["calc-member", "calc-other"]); });
  afterAll(async () => { await Promise.all([a, b, otherUid, outsider, anon].map(async (client) => { await terminate(client.db); await deleteApp(client.app); })); });
  it("issues one sequence per concurrent save and allows more than ten redos without overwrite", async () => {
    const concurrent = await Promise.all([save(a, "first", { score: 0 }), save(b, "second", { score: 7 })]);
    expect(concurrent.map((item) => item.attemptNo).sort()).toEqual([1, 2]);
    const firstBefore = (await getDocFromServer(attemptDoc(a, "first"))).data();
    for (let i = 0; i < 12; i++) await save(i % 2 ? a : b, `redo-${i}`, { score: i % 8, elapsedSeconds: 100 + i });
    const history = await getDocsFromServer(getCalculationAttempts(a.db, familyId, "calc-member", getJstDateKey(1000)));
    expect(history.size).toBe(14);
    expect(new Set(history.docs.map((item) => item.data().attemptNo)).size).toBe(14);
    expect((await getDocFromServer(attemptDoc(a, "first"))).data()).toEqual(firstBefore);
    expect((await getDocFromServer(doc(getCalculationDays(a.db, familyId, "calc-member"), getJstDateKey(1000)))).data()).toMatchObject({ attemptCount: 14, bestScore: 7, latestScore: 3 });
  });
  it("double tap, concurrent duplicate and retry after response loss save once", async () => {
    const results = await Promise.all([save(a, "same"), save(b, "same")]);
    expect(results[0]).toEqual(results[1]);
    expect(await save(b, "same", { score: 7 })).toEqual(results[0]);
    expect((await getDocFromServer(doc(getCalculationDays(a.db, familyId, "calc-member"), getJstDateKey(1000)))).data()?.attemptCount).toBe(15);
  });
  it("UID paths stay separate, family reads are allowed, other UID writes are denied", async () => {
    await commitCalculationAttempt(otherUid.db, familyId, "calc-other", draft("own"));
    expect((await getDocsFromServer(getCalculationAttempts(otherUid.db, familyId, "calc-other", getJstDateKey(1000)))).size).toBe(1);
    expect((await getDocFromServer(attemptDoc(otherUid, "first"))).exists()).toBe(true);
    await denied(save(otherUid, "wrong-uid"));
  });
  it("rebuilds charts from 15 saved past-day attempts on a fresh client without mixing UIDs or days", async () => {
    const startedAt = Date.parse("2026-09-10T10:00:00+09:00");
    const dateKey = getJstDateKey(startedAt);
    const saved: CalculationAttempt[] = [];
    for (let index = 0; index < 15; index++) {
      saved.push(await commitCalculationAttempt(a.db, familyId, "calc-member", draft(`ux-${index}`, {
        startedAt, finishedAt: startedAt + 300000, dateKey, score: index === 10 ? 7 : index % 7, elapsedSeconds: 300 - index * 13,
      })));
    }
    await commitCalculationAttempt(otherUid.db, familyId, "calc-other", draft("ux-other", { startedAt, finishedAt: startedAt + 1000, dateKey, score: 7, elapsedSeconds: 1 }));
    const fresh = makeClient("calc-member");
    try {
      const restored = (await getDocsFromServer(getCalculationAttempts(fresh.db, familyId, "calc-member", dateKey))).docs.map((item) => item.data() as CalculationAttempt);
      expect(calculationAttemptTrend(restored, dateKey)).toEqual(calculationAttemptTrend(saved, dateKey));
      expect(restored).toHaveLength(15);
      expect(calculationAttemptTrend(restored, getJstDateKey(1000))).toEqual([]);
      const other = (await getDocsFromServer(getCalculationAttempts(otherUid.db, familyId, "calc-other", dateKey))).docs.map((item) => item.data() as CalculationAttempt);
      expect(calculationAttemptTrend(other, dateKey)).toEqual([{ id: "ux-other", attemptNo: 1, label: "初回", score: 7, elapsedSeconds: 1 }]);
      const day = (await getDocFromServer(doc(getCalculationDays(fresh.db, familyId, "calc-member"), dateKey))).data();
      expect(day).toMatchObject({ attemptCount: 15, firstScore: 0, firstElapsedSeconds: 300, bestScore: 7, latestScore: 0, latestElapsedSeconds: 118 });
      expect(calculationStartLabel(day as Parameters<typeof calculationStartLabel>[0])).toBe("もう一度挑戦する");
    } finally { await terminate(fresh.db); await deleteApp(fresh.app); }
  });
  it.each([outsider, anon])("denies outsiders and anonymous read/create", async (client) => {
    await denied(getDocFromServer(attemptDoc(client, "first")));
    await denied(getDocsFromServer(getCalculationDays(client.db, familyId, "calc-member")));
    await denied(save(client, "denied"));
  });
  it("denies attempt update/delete and standalone counter edits", async () => {
    await denied(updateDoc(attemptDoc(a, "first"), { score: 7 }));
    await denied(deleteDoc(attemptDoc(a, "first")));
    const day = doc(getCalculationDays(a.db, familyId, "calc-member"), getJstDateKey(1000));
    await denied(updateDoc(day, { attemptCount: 16 }));
    await denied(updateDoc(day, { firstScore: 7 }));
    await denied(deleteDoc(day));
  });
  it.each([{ score: 8 }, { score: -1 }, { score: 0.5 }, { elapsedSeconds: -1 }, { elapsedSeconds: 14401 }, { elapsedSeconds: 0.5 }, { attemptNo: 0 }, { attemptNo: 1.5 }, { maxScore: 8 }, { attemptType: "first" }, { dateKey: 42 }, { extra: true }])("Rules reject malformed attempt %j", async (invalid) => {
    const dayRef = doc(getCalculationDays(a.db, familyId, "calc-member"), getJstDateKey(1000));
    const previous = (await getDocFromServer(dayRef)).data();
    const next = { ...draft(`bad-${crypto.randomUUID()}`), attemptNo: previous!.attemptCount + 1, maxScore: 7, attemptType: "redo", createdAt: 1, ...invalid } as CalculationAttempt;
    const batch = writeBatch(a.db);
    batch.set(attemptDoc(a, next.id), next);
    batch.set(dayRef, summarizeCalculation(previous as Parameters<typeof summarizeCalculation>[0], next));
    await denied(batch.commit());
  });
  it("attempt writes leave normal study, reward ledger and game untouched", async () => {
    expect((await getDocsFromServer(collection(a.db, "families", familyId, "tasks"))).size).toBe(0);
    expect((await getDocsFromServer(collection(a.db, "families", familyId, "rewardLedger"))).size).toBe(0);
    expect((await getDocFromServer(doc(a.db, "families", familyId, "game", "idol-produce"))).exists()).toBe(false);
  });
  it("links cards, appends concurrent unlimited redos, reloads independent task records and preserves study/rewards", async () => {
    const taskOne = { ...task("calc-one"), category: "計算", title: "①", isRunning: false, history: Array.from({ length: 3 }, (_, i) => ({ id: `old-${i}`, date: "10/1", duration: 60, memo: "existing" })) };
    const taskTwo = { ...task("calc-two"), category: "計算", title: "②", isRunning: false };
    await setDoc(taskRef(a, taskOne.id), taskOne); await setDoc(taskRef(a, taskTwo.id), taskTwo);
    const startedAt = Date.parse("2026-09-11T10:00:00+09:00"), dateKey = getJstDateKey(startedAt);
    const linked = (id: string, taskId: string, score = 3) => draft(id, { taskId, taskLabel: `第1回 / 計算${taskId}`, startedAt, finishedAt: startedAt + 260000, dateKey, score });
    const first = await commitCalculationAttempt(a.db, familyId, "calc-member", linked("linked-first", taskOne.id));
    await commitCalculationAttempt(b.db, familyId, "calc-member", linked("linked-second-task", taskTwo.id, 2));
    const duplicates = await Promise.all([a, b].map(client => commitCalculationAttempt(client.db, familyId, "calc-member", linked("linked-duplicate", taskOne.id, 7))));
    expect(duplicates[0]).toEqual(duplicates[1]);
    for (let i = 0; i < 11; i++) await commitCalculationAttempt(i % 2 ? a.db : b.db, familyId, "calc-member", linked(`linked-redo-${i}`, taskOne.id, i % 7));
    await commitCalculationAttempt(otherUid.db, familyId, "calc-other", linked("linked-other-uid", taskOne.id, 0));
    const fresh = makeClient("calc-member");
    try {
      const restored = (await getDocsFromServer(getCalculationAttempts(fresh.db, familyId, "calc-member", dateKey))).docs.map(item => item.data() as CalculationAttempt);
      const records = calculationTaskRecords(restored), one = records.find(r => r.taskId === taskOne.id)!;
      expect(one).toMatchObject({ attemptCount: 13, firstScore: 3, firstElapsedSeconds: 260, bestScore: 7 });
      expect(one.history.at(-1)).toMatchObject({ trialNo: 13, label: "解き直し12回目" });
      expect(one.history[0]).toMatchObject(first);
      expect(calculationStartLabel(one)).toBe("もう一度挑戦する");
      expect(records.find(r => r.taskId === taskTwo.id)).toMatchObject({ firstScore: 2, attemptCount: 1 });
      const other = (await getDocsFromServer(getCalculationAttempts(otherUid.db, familyId, "calc-other", dateKey))).docs.map(item => item.data() as CalculationAttempt);
      expect(calculationTaskRecords(other)[0]).toMatchObject({ firstScore: 0, attemptCount: 1 });
      expect((await getDocFromServer(taskRef(a, taskOne.id))).data()).toEqual(taskOne);
      expect((await getDocFromServer(taskRef(a, taskTwo.id))).data()).toEqual(taskTwo);
      expect((await getDocsFromServer(collection(a.db, "families", familyId, "rewardLedger"))).size).toBe(0);
      expect((await getDocFromServer(doc(a.db, "families", familyId, "game", "idol-produce"))).exists()).toBe(false);
      expect((await getDocFromServer(attemptDoc(a, "first"))).data()).toMatchObject({ score: 0 });
    } finally { await terminate(fresh.db); await deleteApp(fresh.app); }
  });
  it.each([
    { taskId: "missing-task", taskLabel: "missing" }, { taskId: 42 }, { taskId: "" },
    { taskId: "calc-one", taskLabel: 42 }, { taskId: "calc-one", taskLabel: "x".repeat(301) }, { taskLabel: "orphan" },
  ])("Rules reject malformed or missing task links %j without altering old attempts", async invalid => {
    const dayRef = doc(getCalculationDays(a.db, familyId, "calc-member"), getJstDateKey(1000));
    const previous = (await getDocFromServer(dayRef)).data() as Parameters<typeof summarizeCalculation>[0];
    const next = { ...draft(`link-bad-${crypto.randomUUID()}`), attemptNo: previous!.attemptCount + 1, maxScore: 7, attemptType: "redo", createdAt: 1, ...invalid } as CalculationAttempt;
    const batch = writeBatch(a.db); batch.set(attemptDoc(a, next.id), next); batch.set(dayRef, summarizeCalculation(previous, next));
    await denied(batch.commit());
    expect((await getDocFromServer(dayRef)).data()).toEqual(previous);
  });
  it("rejects another subject/category and cross-family task links", async () => {
    await setDoc(taskRef(a, "not-calculation"), { ...task("not-calculation"), category: "プリント" });
    await setDoc(taskRef(a, "wrong-subject"), { ...task("wrong-subject"), subject: "science", category: "計算" });
    const foreignFamily = `${familyId}-foreign`; await seedFamily(foreignFamily, ["calc-member"]);
    await setDoc(doc(a.db, "families", foreignFamily, "tasks", "foreign-task"), { ...task("foreign-task"), category: "計算" });
    for (const id of ["not-calculation", "wrong-subject", "foreign-task"]) await denied(save(a, `denied-${id}`, { taskId: id, taskLabel: id }));
    await denied(save(otherUid, "linked-wrong-uid", { taskId: "calc-one", taskLabel: "①" }));
  });
  it("persists pending across independent clients and confirms once without creating a second session", async () => {
    const current = task("pending"); await setDoc(taskRef(a, current.id), current);
    await study(a, studyOperation(current, "save"));
    const saved = (await getDocFromServer(taskRef(b, current.id))).data() as SessionTask;
    expect(saved.history[0]).toMatchObject({ reviewStatus: "pending", creditedDuration: 0, duration: 900 });
    expect(getSessionActivityPoints({ ...saved.history[0], id: current.sessionId! })).toBe(0);
    const results = await Promise.all([study(a, studyOperation(current, "confirm", { confirmedDurationSeconds: 600 })), study(b, studyOperation(current, "confirm", { confirmedDurationSeconds: 0 }))]);
    expect(results.map((result) => result.status).sort()).toEqual(["applied", "duplicate"]);
    const confirmed = (await getDocFromServer(taskRef(a, current.id))).data() as SessionTask;
    expect(confirmed.history).toHaveLength(1); expect(confirmed.history[0].reviewStatus).toBe("confirmed");
    const before = confirmed.history[0];
    await study(b, studyOperation(current, "confirm", { confirmedDurationSeconds: 900 }));
    expect((await getDocFromServer(taskRef(a, current.id))).data()?.history[0]).toEqual(before);
  });
  it("network failure retains pending and zero confirm issues zero credit", async () => {
    const current = task("failure"); await setDoc(taskRef(a, current.id), current); await study(a, studyOperation(current, "save"));
    await disableNetwork(b.db);
    await expect(study(b, studyOperation(current, "confirm", { confirmedDurationSeconds: 0 }))).rejects.toThrow();
    expect((await getDocFromServer(taskRef(a, current.id))).data()?.history[0].reviewStatus).toBe("pending");
    await enableNetwork(b.db);
    await study(b, studyOperation(current, "confirm", { confirmedDurationSeconds: 0 }));
    expect((await getDocFromServer(taskRef(a, current.id))).data()?.history[0]).toMatchObject({ duration: 0, creditedDuration: 0, reviewStatus: "confirmed" });
  });
  it("a stale confirm preserves the currently active task and observation cannot revive saved sessions", async () => {
    const current = task("stale"); await setDoc(taskRef(a, current.id), current); await study(a, studyOperation(current, "save"));
    const stopped = (await getDocFromServer(taskRef(a, current.id))).data() as SessionTask;
    await study(a, studyOperation(stopped, "start", { at: 1000000, operationId: "new" }));
    await study(b, studyOperation(current, "confirm", { confirmedDurationSeconds: 600 }));
    expect((await getDocFromServer(taskRef(a, current.id))).data()).toMatchObject({ isRunning: true, sessionId: "new" });
    expect((await getDocFromServer(doc(a.db, "families", familyId))).data()?.activeStudyTaskId).toBe("stale");
    expect((await study(b, studyOperation(current, "observe", { lastUserActivityAt: 1000001 }))).status).toBe("conflict");
  });
});
