import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, getFirestore, writeBatch } from "firebase/firestore";
import { getCalculationAttempts, getJstDateKey } from "../src/daily-calculation";
import { createInitialGameState } from "../src/game/config";
import { normalizeGachaState } from "../src/game/gacha/logic";
import { commitStudySessionOperation, createStudySessionOperation, type SessionTask } from "../src/study-session";

const PROJECT = "demo-study-hotfix", FAMILY = "hotfix-study-family";
const fresh = getApps().length === 0;
const app = fresh ? initializeApp({ projectId: PROJECT, apiKey: "emulator-only", authDomain: `${PROJECT}.firebaseapp.com`, appId: "1:000000000000:web:hotfix" }) : getApp();
if (location.hostname !== "127.0.0.1" || app.options.projectId !== PROJECT) throw new Error("Dedicated localhost emulator required");
const auth = getAuth(app), db = getFirestore(app);
if (fresh) {
  connectAuthEmulator(auth, "http://127.0.0.1:9098", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8086);
}
const root = `families/${FAMILY}`;
export const login = async (email: string, password: string) => (await signInWithEmailAndPassword(auth, email, password)).user.uid;
export const seed = async () => {
  if (!auth.currentUser || !(await getDocFromServer(doc(db, root))).data()?.memberUids.includes(auth.currentUser.uid)) throw new Error("Membership required");
  if (!(await getDocsFromServer(collection(db, root, "tasks"))).empty) throw new Error("Fresh emulator required; never overwrite history");
  const tasks = [...["①", "②", "③", "④", "⑤", "⑥", "⑦"].map(title => ({ id: `calc-${title}`, title, category: "計算" })), { id: "normal", title: "基本問題", category: "予習シリーズ" }, { id: "other", title: "練習問題", category: "予習シリーズ" }];
  const batch = writeBatch(db);
  for (const task of tasks) batch.set(doc(db, root, "tasks", task.id), { ...task, unit: "第1回", subject: "math", materialName: `${task.category} - ${task.title}`, status: "not_started", currentDuration: 0, sessionStartTime: null, isRunning: false, lastUpdatedAt: Date.now(), currentMemo: "", history: [], createdAt: new Date().toISOString() });
  batch.set(doc(db, root, "game", "idol-produce"), createInitialGameState());
  batch.set(doc(db, root, "game", "idol-produce", "gacha", "state"), normalizeGachaState());
  await batch.commit();
};
export const read = async () => {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Login required");
  const tasks = await getDocsFromServer(collection(db, root, "tasks"));
  const attempts = await getDocsFromServer(getCalculationAttempts(db, FAMILY, auth.currentUser.uid, getJstDateKey()));
  const game = await getDocFromServer(doc(db, root, "game", "idol-produce"));
  const ledger = await getDocsFromServer(collection(db, root, "rewardLedger"));
  return { uid: auth.currentUser.uid, tasks: tasks.docs.map(item => ({ ...item.data(), id: item.id })), attempts: attempts.docs.map(item => item.data()).sort((a, b) => a.attemptNo - b.attemptNo), game: game.data(), ledger: ledger.docs.map(item => item.data()) };
};
export const historicalIdle = async () => {
  const task = (await getDocFromServer(doc(db, root, "tasks", "normal"))).data() as SessionTask;
  return commitStudySessionOperation(db, collection(db, root, "tasks"), createStudySessionOperation(task, "start", Date.now() - 901000));
};
export const familyAccessDenied = async () => {
  try { await read(); return false; }
  catch (error) { return (error as { code?: string }).code === "permission-denied"; }
};
