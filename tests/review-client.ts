// Browser-only local fixture; never imported by production entry points.
import { getApp } from "firebase/app";
import { collection, doc, getDocFromServer, getDocsFromServer, getFirestore } from "firebase/firestore";
import { auth } from "./timer-client";
import { loadReview, loadReviewManagement, saveReview } from "../src/review/repository";
import type { Draft } from "../src/review/model";
const project = "demo-study-hotfix", family = "hotfix-study-family";
if (location.hostname !== "127.0.0.1" || getApp().options.projectId !== project) throw new Error("Local demo required");
const db = getFirestore(getApp());
export const inspect = () => loadReview(db, family, auth.currentUser!.uid);
export const inspectManagement = (uid: string) => loadReviewManagement(db, family, uid);
export const inspectTests = async () => (await getDocsFromServer(collection(db, "families", family, "tests"))).docs.map(d => d.data());
export const replay = (draft: Draft) => saveReview(db, family, auth.currentUser!.uid, draft);
export const crossUidDenied = async (uid: string) => {
  try { await loadReview(db, family, uid); return false; } catch (e) { return (e as { code?: string }).code === "permission-denied"; }
};
export const foreignFamilyDenied = async () => {
  try { await getDocFromServer(doc(db, "families", "other-family", "reviewUsers", auth.currentUser!.uid, "questions", "q")); return false; }
  catch (e) { return (e as { code?: string }).code === "permission-denied"; }
};
