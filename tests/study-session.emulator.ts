import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { collection, connectFirestoreEmulator, disableNetwork, doc, enableNetwork, getDocFromServer, getDocsFromServer, getFirestore, setDoc, terminate, Timestamp, type Firestore } from "firebase/firestore";
import { commitStudySessionOperation, drainStudySessionOperations, getStudySessionId, type SessionTask, type StudySessionOperation } from "../src/study-session";
import { getSessionActivityPoints, getUnclaimedRewards } from "../src/game/rewards";

const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("FIRESTORE_EMULATOR_HOST must be an explicit localhost emulator endpoint");
const port = Number(endpoint.split(":")[1]);
const projectId = "demo-study-v182";
const apps: FirebaseApp[] = [];
const clients: Firestore[] = [];
let fixtureNumber = 0;
const fixture = () => `families/test-${Date.now()}-${fixtureNumber++}/tasks`;
const task = (id: string, overrides: Partial<SessionTask> = {}): SessionTask => ({ id, unit: "第1回", subject: "math", status: "in_progress", currentDuration: 0, sessionStartTime: null, isRunning: false, history: [], lastUpdatedAt: 1, ...overrides });
const operation = (current: SessionTask, kind: StudySessionOperation["kind"], operationId: string, at: number): StudySessionOperation => ({ taskId: current.id, kind, operationId, at, sessionId: getStudySessionId(current) });
const read = async (client: number, path: string, id: string) => (await getDocFromServer(doc(clients[client], path, id))).data() as SessionTask;
const commit = (client: number, path: string, op: StudySessionOperation) => commitStudySessionOperation(clients[client], collection(clients[client], path), op);

describe("two independent Firestore clients", () => {
  beforeAll(() => {
    for (let i = 0; i < 2; i++) {
      const app = initializeApp({ projectId, apiKey: "emulator-only" }, `study-test-${i}-${Date.now()}`);
      apps.push(app);
      const db = getFirestore(app);
      connectFirestoreEmulator(db, "127.0.0.1", port);
      clients.push(db);
    }
  });
  afterAll(async () => {
    await Promise.all(clients.map((client) => terminate(client)));
    await Promise.all(apps.map((app) => deleteApp(app)));
  });
  it("A START then B START leaves only B active", async () => {
    const path = fixture(); const a = task("a"); const b = task("b");
    await setDoc(collection(clients[0], path).parent!, { familyName: "fixture" });
    await Promise.all([setDoc(doc(clients[0], path, "a"), a), setDoc(doc(clients[1], path, "b"), b)]);
    await commit(0, path, operation(a, "start", "a-start", 1000));
    await commit(1, path, operation(b, "start", "b-start", 601000));
    const saved = (await getDocsFromServer(collection(clients[0], path))).docs.map((item) => item.data());
    expect(saved.filter((item) => item.isRunning).map((item) => item.id)).toEqual(["b"]);
    expect(await read(0, path, "a")).toMatchObject({ currentDuration: 600, sessionId: "a-start", isRunning: false });
    expect((await getDocFromServer(collection(clients[0], path).parent!)).data()).toMatchObject({ familyName: "fixture", activeStudyTaskId: "b" });
  });
  it("A START then B START then delayed A STOP preserves B's session", async () => {
    const path = fixture(); const a = task("a"); const b = task("b");
    await Promise.all([setDoc(doc(clients[0], path, "a"), a), setDoc(doc(clients[1], path, "b"), b)]);
    await commit(0, path, operation(a, "start", "a-start", 1000));
    const stale = await read(0, path, "a");
    await commit(1, path, operation(b, "start", "b-start", 601000));
    const activeBefore = await read(1, path, "b");
    expect((await commit(0, path, operation(stale, "save", "late-stop", 602000))).status).toBe("applied");
    expect(await read(0, path, "b")).toEqual(activeBefore);
    expect((await getDocFromServer(collection(clients[0], path).parent!)).data()?.activeStudyTaskId).toBe("b");
    const saved = await read(0, path, "a");
    expect(saved).toMatchObject({ isRunning: false, currentDuration: 0 });
    expect(saved.history).toHaveLength(1);
    expect(saved.history[0]).toMatchObject({ id: "a-start", duration: 600 });
    expect((await commit(0, path, operation(stale, "save", "late-stop-retry", 603000))).status).toBe("duplicate");
    expect(await read(0, path, "b")).toEqual(activeBefore);
  });
  it("A START then B STOP saves the session and A observes no ghost timer", async () => {
    const path = fixture(); const a = task("a");
    await setDoc(doc(clients[0], path, "a"), a);
    await commit(0, path, operation(a, "start", "start", 1000));
    const bView = await read(1, path, "a");
    await commit(1, path, operation(bView, "save", "stop", 601000));
    const saved = await read(0, path, "a");
    expect(saved).toMatchObject({ isRunning: false, currentDuration: 0 });
    expect(saved.history).toHaveLength(1);
    expect(saved.history[0]).toMatchObject({ id: "start", duration: 600, creditedDuration: 600 });
    expect((await getDocFromServer(collection(clients[0], path).parent!)).data()?.activeStudyTaskId).toBeNull();
  });
  it("rejects delayed STOP and pause after a new session starts", async () => {
    const path = fixture(); const a = task("a");
    await setDoc(doc(clients[0], path, "a"), a);
    await commit(0, path, operation(a, "start", "old", 1000));
    const stale = await read(0, path, "a");
    await commit(1, path, operation(stale, "pause", "pause", 601000));
    await commit(1, path, operation(await read(1, path, "a"), "start", "new", 602000));
    expect((await commit(0, path, operation(stale, "save", "late-stop", 603000))).status).toBe("conflict");
    expect((await commit(0, path, operation(stale, "pause", "late-pause", 603000))).status).toBe("conflict");
    expect((await commit(0, path, operation(stale, "start", "late-resume", 604000))).status).toBe("conflict");
    expect(await read(0, path, "a")).toMatchObject({ sessionId: "new", isRunning: true, history: [] });
  });
  it("serializes simultaneous START on different tasks to the newer start", async () => {
    const path = fixture(); const a = task("a"); const b = task("b");
    await Promise.all([setDoc(doc(clients[0], path, "a"), a), setDoc(doc(clients[1], path, "b"), b)]);
    await Promise.all([commit(0, path, operation(a, "start", "a-start", 1000)), commit(1, path, operation(b, "start", "b-start", 2000))]);
    const saved = (await getDocsFromServer(collection(clients[0], path))).docs.map((item) => item.data());
    expect(saved.filter((item) => item.isRunning).map((item) => item.id)).toEqual(["b"]);
  });
  it("saves simultaneous STOP once without losing an earlier history entry", async () => {
    const path = fixture(); const a = task("a", { isRunning: true, sessionStartTime: 1000, sessionId: "active", history: [{ id: "earlier", duration: 60 }] });
    await setDoc(doc(clients[0], path, "a"), a);
    const results = await Promise.all([commit(0, path, operation(a, "save", "stop-a", 601000)), commit(1, path, operation(a, "save", "stop-b", 602000))]);
    expect(results.map((result) => result.status).sort()).toEqual(["applied", "duplicate"]);
    const saved = await read(0, path, "a");
    expect(saved.history.map((entry) => entry.id)).toEqual(["earlier", "active"]);
    expect(saved.history.filter((entry) => entry.id === "active")).toHaveLength(1);
  });
  it("replays an acknowledged STOP without resetting a subsequent session", async () => {
    const path = fixture(); const a = task("a", { isRunning: true, sessionStartTime: 1000, sessionId: "old" });
    await setDoc(doc(clients[0], path, "a"), a);
    const stop = operation(a, "save", "stop", 601000);
    await commit(0, path, stop);
    await commit(1, path, operation(await read(1, path, "a"), "start", "new", 602000));
    expect((await commit(0, path, stop)).status).toBe("duplicate");
    expect(await read(0, path, "a")).toMatchObject({ sessionId: "new", isRunning: true });
  });
  it("replays an offline operation queue in order without resurrecting an old session", async () => {
    const path = fixture(); const a = task("a");
    await setDoc(doc(clients[0], path, "a"), a);
    const start = operation(a, "start", "offline-start", 1000);
    const stop: StudySessionOperation = { ...operation(a, "save", "offline-stop", 601000), sessionId: start.operationId };
    let queue = [start, stop];
    const statuses: string[] = [];
    const drain = () => drainStudySessionOperations(() => queue, (value) => { queue = value; }, (op) => commit(0, path, op), (_op, result) => statuses.push(result.status));
    await disableNetwork(clients[0]);
    await expect(drain()).rejects.toThrow();
    expect(queue).toEqual([start, stop]);
    await commit(1, path, operation(a, "start", "device-b", 2000));
    await enableNetwork(clients[0]);
    await drain();
    expect(statuses).toEqual(["conflict", "conflict"]);
    expect(queue).toEqual([]);
    expect(await read(0, path, "a")).toMatchObject({ sessionId: "device-b", isRunning: true, history: [] });
  });
  it("resolves identical-time START by task ID on both clients", async () => {
    const path = fixture(); const a = task("a"); const b = task("b");
    await Promise.all([setDoc(doc(clients[0], path, "a"), a), setDoc(doc(clients[1], path, "b"), b)]);
    await Promise.all([commit(0, path, operation(a, "start", "a-start", 1000)), commit(1, path, operation(b, "start", "b-start", 1000))]);
    const saved = (await getDocsFromServer(collection(clients[1], path))).docs.map((item) => item.data());
    expect(saved.filter((item) => item.isRunning).map((item) => item.id)).toEqual(["a"]);
  });
  it("does not admit two simultaneous STARTs on the same task", async () => {
    const path = fixture(); const a = task("a");
    await setDoc(doc(clients[0], path, "a"), a);
    const results = await Promise.all([commit(0, path, operation(a, "start", "start-a", 1000)), commit(1, path, operation(a, "start", "start-b", 1001))]);
    expect(results.map((result) => result.status).sort()).toEqual(["applied", "conflict"]);
    expect((await read(1, path, "a")).isRunning).toBe(true);
  });
  it("retries a committed STOP after response loss without adding a second history", async () => {
    const path = fixture(); const a = task("a", { isRunning: true, sessionStartTime: 1000, sessionId: "active" });
    await setDoc(doc(clients[0], path, "a"), a);
    const stop = operation(a, "save", "stop", 601000);
    let queue = [stop];
    await expect(drainStudySessionOperations(() => queue, (value) => { queue = value; }, async (op) => {
      await commit(0, path, op);
      throw new Error("response lost");
    }, () => {})).rejects.toThrow("response lost");
    expect(queue).toEqual([stop]);
    const statuses: string[] = [];
    await drainStudySessionOperations(() => queue, (value) => { queue = value; }, (op) => commit(1, path, op), (_op, result) => statuses.push(result.status));
    expect(statuses).toEqual(["duplicate"]);
    expect(queue).toEqual([]);
    const saved = await read(1, path, "a");
    expect(saved.history).toEqual([expect.objectContaining({ id: "active", duration: 600, creditedDuration: 600 })]);
    const entries = saved.history.map((entry) => ({ ...entry, id: entry.id! }));
    expect(getUnclaimedRewards(entries, [])).toBe(getSessionActivityPoints(entries[0]));
    expect(getUnclaimedRewards(entries, ["active"])).toBe(0);
  });
  it("supports legacy Timestamp starts and missing optional history or status fields", async () => {
    const path = fixture();
    await setDoc(doc(clients[0], path, "a"), { isRunning: true, currentDuration: 0, sessionStartTime: Timestamp.fromMillis(1000) });
    const legacyView = task("a", { isRunning: true, sessionStartTime: 1000 });
    expect((await commit(1, path, operation(legacyView, "save", "legacy-stop", 601000))).status).toBe("applied");
    const saved = await read(0, path, "a");
    expect(saved).toMatchObject({ sessionId: "legacy-a-1000", isRunning: false, status: "in_progress" });
    expect(saved.history).toEqual([expect.objectContaining({ id: "legacy-a-1000", duration: 600, creditedDuration: 600 })]);
  });
  it("keeps one active timer when another device creates a task during START", async () => {
    const path = fixture(); const a = task("a"); const b = task("b");
    await setDoc(doc(clients[0], path, "a"), a);
    const startingA = commit(0, path, operation(a, "start", "a-start", 1000));
    await setDoc(doc(clients[1], path, "b"), b);
    await Promise.all([startingA, commit(1, path, operation(b, "start", "b-start", 2000))]);
    const saved = (await getDocsFromServer(collection(clients[0], path))).docs.map((item) => item.data());
    expect(saved.filter((item) => item.isRunning).map((item) => item.id)).toEqual(["b"]);
    expect((await getDocFromServer(collection(clients[0], path).parent!)).data()?.activeStudyTaskId).toBe("b");
  });
});
