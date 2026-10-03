import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocsFromServer, getFirestore, setDoc, terminate, updateDoc } from "firebase/firestore";
import { seedFamily } from "./emulator-admin";
import { commitStudySessionOperation, getStudySessionId, type SessionTask } from "../src/study-session";

const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator endpoint required");
const familyId = `rules-${Date.now()}`;
const root = `families/${familyId}`;
const game = `${root}/game/idol-produce`;
const makeClient = (uid?: string) => {
  const app = initializeApp({ projectId: "demo-study-v182", apiKey: "emulator-only" }, `rules-${uid ?? "anonymous"}-${Date.now()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", Number(endpoint.split(":")[1]), uid ? { mockUserToken: { sub: uid } } : undefined);
  return { app, db };
};
const member = makeClient("rules-member");
const outsider = makeClient("rules-outsider");
const anonymous = makeClient();
const denied = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ code: "permission-denied" });

describe("repository Firestore Rules", () => {
  beforeAll(async () => {
    await seedFamily(familyId, ["rules-member"], { familyName: { stringValue: "preserved" } });
    await seedFamily(`${familyId}-other`, ["rules-outsider"]);
  });
  afterAll(async () => {
    await Promise.all([member, outsider, anonymous].map(async ({ app, db }) => { await terminate(db); await deleteApp(app); }));
  });

  it("denies unauthenticated family read and write", async () => {
    await denied(getDocFromServer(doc(anonymous.db, root)));
    await denied(updateDoc(doc(anonymous.db, root), { activeStudyTaskId: "a" }));
  });
  it("allows member family read", async () => {
    expect((await getDocFromServer(doc(member.db, root))).data()?.memberUids).toEqual(["rules-member"]);
  });
  it("denies nonmember family read and update", async () => {
    await denied(getDocFromServer(doc(outsider.db, root)));
    await denied(updateDoc(doc(outsider.db, root), { activeStudyTaskId: "a" }));
  });
  it("denies cross-family access by a member of another family", async () => {
    await denied(getDocFromServer(doc(member.db, `${root}-other`)));
    await denied(setDoc(doc(member.db, `${root}-other/tasks/a`), { status: "in_progress" }));
  });
  it("denies family creation and self-enrollment", async () => {
    await denied(setDoc(doc(member.db, `${root}-new`), { memberUids: ["rules-member"] }));
    await denied(setDoc(doc(outsider.db, root), { memberUids: ["rules-outsider"] }, { merge: true }));
  });
  it("denies adding, removing, replacing or deleting memberUids", async () => {
    for (const uids of [["rules-member", "rules-outsider"], [], ["rules-outsider"]]) {
      await denied(updateDoc(doc(member.db, root), { memberUids: uids }));
    }
    await denied(setDoc(doc(member.db, root), { activeStudyTaskId: null }));
  });
  it("allows only activeStudyTaskId updates and preserves existing fields", async () => {
    await setDoc(doc(member.db, root), { activeStudyTaskId: "a" }, { merge: true });
    await updateDoc(doc(member.db, root), { activeStudyTaskId: null });
    expect((await getDocFromServer(doc(member.db, root))).data()).toMatchObject({ memberUids: ["rules-member"], familyName: "preserved", activeStudyTaskId: null });
  });
  it("denies unknown field addition and existing field modification", async () => {
    await denied(updateDoc(doc(member.db, root), { unknown: true }));
    await denied(updateDoc(doc(member.db, root), { familyName: "changed" }));
    await denied(updateDoc(doc(member.db, root), { activeStudyTaskId: 123 }));
  });
  it("denies family deletion", async () => { await denied(deleteDoc(doc(member.db, root))); });
  it.each(["missing", "empty", "invalid"])("denies access when membership is %s", async (kind) => {
    const id = `${familyId}-${kind}`;
    if (kind !== "missing") await seedFamily(id, [], kind === "invalid" ? { memberUids: { stringValue: "rules-member" } } : {});
    await denied(getDocFromServer(doc(member.db, `families/${id}`)));
    await denied(setDoc(doc(member.db, `families/${id}/tasks/a`), { status: "in_progress" }));
  });
  it.each(["tasks", "tests"])("allows member %s CRUD and list", async (name) => {
    const ref = doc(member.db, `${root}/${name}/crud`);
    await setDoc(ref, { status: "in_progress" });
    await updateDoc(ref, { status: "completed" });
    expect((await getDocFromServer(ref)).data()?.status).toBe("completed");
    expect((await getDocsFromServer(collection(member.db, `${root}/${name}`))).size).toBeGreaterThan(0);
    await deleteDoc(ref);
  });
  const records = [
    `${root}/rewardLedger/reward`, `${game}/weeks/week`, `${game}/performances/performance`,
    `${game}/rivalBattles/battle`, `${game}/gachaWeeks/week`, `${game}/gachaDraws/draw`, `${game}/gachaExchanges/exchange`,
  ];
  it.each(records)("allows record creation/read but denies update/delete: %s", async (path) => {
    const ref = doc(member.db, path);
    await setDoc(ref, { createdAt: 1 });
    expect((await getDocFromServer(ref)).exists()).toBe(true);
    await denied(updateDoc(ref, { createdAt: 2 }));
    await denied(deleteDoc(ref));
  });
  it.each([game, `${game}/gacha/state`])("allows mutable state creation/read/update but denies delete: %s", async (path) => {
    const ref = doc(member.db, path);
    await setDoc(ref, { fans: 0 });
    await updateDoc(ref, { fans: 1 });
    expect((await getDocFromServer(ref)).data()?.fans).toBe(1);
    await denied(deleteDoc(ref));
  });
  it.each([`${root}/tasks/a`, `${root}/tests/a`, game, `${game}/gacha/state`, ...records])("denies anonymous and nonmember subcollection read/write: %s", async (path) => {
    for (const client of [anonymous, outsider]) {
      const ref = doc(client.db, path);
      await denied(getDocFromServer(ref));
      await denied(setDoc(ref, { unauthorized: true }));
      await denied(updateDoc(ref, { unauthorized: true }));
      await denied(deleteDoc(ref));
    }
  });
  it("denies nonmember task queries", async () => {
    await denied(getDocsFromServer(collection(outsider.db, `${root}/tasks`)));
  });
  it("denies unknown collections and unsupported game/gacha documents", async () => {
    for (const path of [`${root}/unknown/a`, `${root}/game/unknown`, `${game}/gacha/unknown`, "users/rules-member"]) {
      await denied(getDocFromServer(doc(member.db, path)));
      await denied(setDoc(doc(member.db, path), { value: 1 }));
    }
  });
  it("allows START PAUSE RESUME STOP, sessionId/history updates and idempotent retry", async () => {
    const tasks = collection(member.db, `${root}/tasks`);
    let task: SessionTask = { id: "session", status: "in_progress", currentDuration: 0, sessionStartTime: null, isRunning: false, history: [] };
    await setDoc(doc(tasks, task.id), task);
    const commit = async (kind: "start" | "pause" | "save", operationId: string, at: number) => {
      const op = { taskId: task.id, kind, operationId, at, sessionId: getStudySessionId(task) };
      const result = await commitStudySessionOperation(member.db, tasks, op);
      task = result.tasks.find((item) => item.id === task.id)!;
      return { result, op };
    };
    expect((await commit("start", "start", 1000)).result.status).toBe("applied");
    expect((await commit("pause", "pause", 61000)).result.status).toBe("applied");
    expect((await commit("start", "resume", 62000)).result.status).toBe("applied");
    const stop = await commit("save", "stop", 122000);
    expect(stop.result.status).toBe("applied");
    expect(task.history).toEqual([expect.objectContaining({ id: "resume", duration: 120 })]);
    expect((await commitStudySessionOperation(member.db, tasks, stop.op)).status).toBe("duplicate");
    expect((await getDocFromServer(doc(tasks, task.id))).data()?.history).toHaveLength(1);
    expect((await getDocFromServer(doc(member.db, root))).data()?.activeStudyTaskId).toBeNull();
  });
  it("denies nonmember START transaction", async () => {
    await denied(commitStudySessionOperation(outsider.db, collection(outsider.db, `${root}/tasks`), { taskId: "session", kind: "start", operationId: "attack", sessionId: "resume", at: 123000 }));
  });
});
