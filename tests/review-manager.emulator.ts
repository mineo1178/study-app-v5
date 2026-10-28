import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocsFromServer, getFirestore, query, setDoc, terminate, updateDoc, where } from "firebase/firestore";
import { sampleQuestions } from "../src/review/model";
import { loadReview, reviewCollection } from "../src/review/repository";
import { seedFamily, seedReviewData, seedReviewManager } from "./emulator-admin";
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator required");
const family = `single-${Date.now()}`;
const client = (uid?: string) => { const app = initializeApp({ projectId: "demo-study-v182", apiKey: "emulator-only" }, crypto.randomUUID()); const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", Number(endpoint.split(":")[1]), uid ? { mockUserToken: { sub: uid } } : undefined); return { app, db }; };
const child = client("child"), legacyManager = client("old-parent"), sameFamily = client("other"), outside = client("outside"), anon = client();
const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "permission-denied" });
const col = (who: typeof child, name: Parameters<typeof reviewCollection>[3]) => reviewCollection(who.db, family, "child", name);
describe("single UID / PC-only administration", () => {
  beforeAll(async () => { await seedFamily(family, ["child", "old-parent", "other"]); await seedReviewManager(family, "old-parent", ["child"]); await seedReviewData(family, "child", "questions", [{ ...sampleQuestions[0], published: true }, { ...sampleQuestions[1], published: false }]); });
  afterAll(async () => { for (const c of [child, legacyManager, sameFamily, outside, anon]) { await terminate(c.db); await deleteApp(c.app); } });
  it("reads published problems without any manager role; excludes private/legacy problems", async () => {
    expect((await loadReview(child.db, family, "child")).questions).toHaveLength(1);
    await denied(getDocFromServer(doc(col(child, "questions"), sampleQuestions[1].id)));
    await denied(getDocsFromServer(col(child, "questions")));
    expect((await getDocsFromServer(query(col(child, "questions"), where("published", "==", true)))).size).toBe(1);
  });
  it.each([child, legacyManager, sameFamily, outside, anon])("rejects all client problem, grading, explanation, publication, weakness and role writes", async who => {
    const ref = doc(col(who, "questions"), sampleQuestions[0].id);
    await denied(setDoc(ref, { ...sampleQuestions[0], version: "new" }));
    for (const patch of [{ correctIndex: 3 }, { explanation: "forged" }, { published: false }]) await denied(updateDoc(ref, patch));
    await denied(deleteDoc(ref));
    await denied(setDoc(doc(col(who, "weaknesses"), "w"), { id: "w", subject: "math", unit: "u", mistake: "m", point: "p", testKind: "未指定", questionIds: [] }));
    const role = doc(who.db, "families", family, "reviewManagers", "old-parent");
    await denied(getDocFromServer(role)); await denied(setDoc(role, { active: true, childUids: ["child"], schemaVersion: 1 })); await denied(deleteDoc(role));
  });
  it.each([legacyManager, sameFamily, outside, anon])("denies another UID's review data despite legacy active role", async who => { for (const name of ["questions", "weaknesses", "attempts", "progress"] as const) await denied(getDocsFromServer(col(who, name))); });
  it("keeps trusted administrator editing and unpublication, preserving client denial", async () => {
    await seedReviewData(family, "child", "questions", [{ ...sampleQuestions[0], published: false, version: "admin-v2" }]);
    expect((await loadReview(child.db, family, "child")).questions).toHaveLength(0);
  });
});
