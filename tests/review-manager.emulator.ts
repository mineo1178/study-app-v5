import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocsFromServer, getFirestore, query, setDoc, terminate, updateDoc, where } from "firebase/firestore";
import { sampleQuestions, answerQuestion, type Draft } from "../src/review/model";
import { loadReview, loadReviewManagement, reviewCollection, saveQuestions, saveReview, saveWeakness } from "../src/review/repository";
import { seedFamily, seedReviewManager } from "./emulator-admin";
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator required");
const family = `roles-${Date.now()}`;
const client = (uid?: string) => { const app = initializeApp({ projectId: "demo-study-v182", apiKey: "emulator-only" }, crypto.randomUUID()); const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", Number(endpoint.split(":")[1]), uid ? { mockUserToken: { sub: uid } } : undefined); return { app, db }; };
const parent = client("parent-a"), child = client("child-b"), other = client("child-c"), outside = client("outside"), anon = client();
const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "permission-denied" });
const col = (who: typeof child, name: Parameters<typeof reviewCollection>[3], uid = "child-b", f = family) => reviewCollection(who.db, f, uid, name);
const role = (who: typeof child, uid = "parent-a") => doc(who.db, "families", family, "reviewManagers", uid);
const question = (who: typeof child) => doc(col(who, "questions"), sampleQuestions[0].id);
const draft = (id: string) => answerQuestion({ id, uid: "child-b", mode: "daily", startedAt: 1000, questionStartedAt: 1000, questions: [sampleQuestions[0]], answers: [], finishedAt: null } satisfies Draft, sampleQuestions[0].correctIndex, 1100);
describe("server-managed parent review permissions", () => {
  beforeAll(async () => { await seedFamily(family, ["parent-a", "child-b", "child-c"]); await seedReviewManager(family, "parent-a", ["child-b", "foreign-child"]); });
  afterAll(async () => { await Promise.all([parent, child, other, outside, anon].map(async c => { await terminate(c.db); await deleteApp(c.app); })); });
  it("allows assigned parent management, 50-question batches and own role get; never role listing", async () => {
    await saveQuestions(parent.db, family, "child-b", sampleQuestions);
    expect((await loadReviewManagement(parent.db, family, "child-b")).questions).toHaveLength(5);
    expect((await getDocFromServer(role(parent))).exists()).toBe(true);
    await denied(getDocsFromServer(collection(parent.db, "families", family, "reviewManagers")));
    const fifty = Array.from({ length: 50 }, (_, i) => ({ ...sampleQuestions[0], id: `bulk-${i}` }));
    await saveQuestions(parent.db, family, "child-b", fifty);
    await expect(saveQuestions(parent.db, family, "child-b", [fifty[0], fifty[0]])).rejects.toThrow("IDが重複");
    const weakness = { id: "weak", subject: "math" as const, unit: "架空単元", mistake: "保護者観察", point: "確認", testKind: "未指定", questionIds: [sampleQuestions[0].id] };
    await saveWeakness(parent.db, family, "child-b", weakness);
    await denied(saveWeakness(child.db, family, "child-b", weakness));
  });
  it("denies child writes, correct-answer edits, nonassigned UID and cross-family management", async () => {
    for (const who of [child, other, outside, anon]) {
      await denied(setDoc(question(who), { ...sampleQuestions[0], version: "forged", correctIndex: 3 }));
      await denied(deleteDoc(question(who)));
    }
    await denied(saveQuestions(parent.db, family, "child-c", sampleQuestions));
    await denied(saveQuestions(parent.db, family, "foreign-child", sampleQuestions));
    await seedFamily(`${family}-foreign`, ["child-b"]);
    await denied(saveQuestions(parent.db, `${family}-foreign`, "child-b", sampleQuestions));
    await denied(deleteDoc(question(parent)));
    await denied(setDoc(question(parent), { ...sampleQuestions[0], version: "invalid", admin: true }));
  });
  it("makes every client unable to create, update or delete roles, including the parent", async () => {
    for (const who of [parent, child, other, outside, anon]) {
      await denied(setDoc(role(who), { active: true, schemaVersion: 1, childUids: ["child-b"] }));
      await denied(updateDoc(role(who), { active: true }));
      await denied(deleteDoc(role(who)));
      await denied(setDoc(role(who, "self-elevated"), { active: true, schemaVersion: 1, childUids: ["child-b"] }));
    }
    for (const who of [child, other, outside, anon]) await denied(getDocFromServer(role(who)));
    await denied(updateDoc(doc(parent.db, "families", family), { reviewManagers: ["parent-a"] }));
  });
  it("allows only the child to append own answers/progress and keeps parent out of private history", async () => {
    await saveReview(child.db, family, "child-b", draft("own-answer"));
    expect((await loadReview(child.db, family, "child-b")).history).toHaveLength(1);
    for (const who of [parent, other, outside, anon]) {
      await denied(getDocsFromServer(col(who, "attempts")));
      await denied(getDocsFromServer(col(who, "progress")));
      await denied(saveReview(who.db, family, "child-b", draft(`wrong-${who.app.name}`)));
    }
    await denied(saveReview(child.db, family, "child-c", { ...draft("other-uid"), uid: "child-c" }));
  });
  it("hides unpublished/legacy questions; rejects saving withdrawn questions; no destructive migration", async () => {
    const { published: _published, ...legacy } = { ...sampleQuestions[0], id: "legacy-q" }; void _published;
    const fields = Object.fromEntries(Object.entries(legacy).map(([key, value]) => [key, Array.isArray(value) ? { arrayValue: { values: value.map(stringValue => ({ stringValue })) } } : typeof value === "number" ? { integerValue: String(value) } : { stringValue: value }]));
    expect((await fetch(`http://${endpoint}/v1/projects/demo-study-v182/databases/(default)/documents/families/${family}/reviewUsers/child-b/questions/legacy-q`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields }) })).status).toBe(200);
    await denied(getDocFromServer(doc(col(child, "questions"), "legacy-q")));
    expect((await loadReviewManagement(parent.db, family, "child-b")).questions.some(q => q.id === "legacy-q" && q.published === undefined)).toBe(true);
    await saveQuestions(parent.db, family, "child-b", [{ ...sampleQuestions[0], published: false, version: "unpublished" }]);
    await denied(getDocFromServer(question(child)));
    await denied(getDocsFromServer(col(child, "questions")));
    expect((await getDocsFromServer(query(col(child, "questions"), where("published", "==", true)))).size).toBe(54);
    await expect(saveReview(child.db, family, "child-b", draft("withdrawn"))).rejects.toBeDefined();
    expect((await loadReviewManagement(parent.db, family, "child-b")).questions.find(q => q.id === sampleQuestions[0].id)?.published).toBe(false);
  });
  it("revokes on role disable, reassignment, deletion and target membership removal", async () => {
    for (const children of [["child-b"], ["child-c"], null]) {
      await seedReviewManager(family, "parent-a", children, false);
      await denied(loadReviewManagement(parent.db, family, "child-b"));
      await denied(saveQuestions(parent.db, family, "child-b", sampleQuestions));
    }
    await seedReviewManager(family, "parent-a", ["child-c"]);
    await denied(loadReviewManagement(parent.db, family, "child-b"));
    await seedReviewManager(family, "parent-a", ["child-b"]);
    await seedFamily(family, ["parent-a", "child-c"]);
    await denied(loadReviewManagement(parent.db, family, "child-b"));
    await seedFamily(family, ["child-b", "child-c"]);
    await denied(getDocFromServer(role(parent)));
  });
});
