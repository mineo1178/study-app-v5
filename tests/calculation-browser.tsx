// Local browser fixture: never connects to a production Firebase project.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getDocsFromServer, getFirestore } from "firebase/firestore";
import { CalculationInput, DailyCalculation } from "../src/components/DailyCalculation";
import { getCalculationAttempts, getJstDateKey } from "../src/daily-calculation";
import "../src/index.css";

const familyId = new URLSearchParams(location.search).get("family") ?? "browser-calculation";
const uidA = "browser-a", uidB = "browser-b";
const makeDb = (uid: string) => {
  const db = getFirestore(initializeApp({ projectId: "demo-study-v182", apiKey: "emulator-only" }, `browser-${uid}`));
  connectFirestoreEmulator(db, "127.0.0.1", 8086, { mockUserToken: { sub: uid } });
  return db;
};
const clients = { [uidA]: makeDb(uidA), [uidB]: makeDb(uidB) };
export const Harness = () => {
  const [uid, setUid] = useState(uidA);
  const [task, setTask] = useState("①");
  const [view, setView] = useState("input");
  const [running, setRunning] = useState(false);
  const [study, setStudy] = useState(false);
  const [saved, setSaved] = useState("");
  const db = clients[uid];
  return <main className="mx-auto max-w-lg space-y-3 p-2">
    <label>UID<select aria-label="UID" value={uid} onChange={event => setUid(event.target.value)}><option>{uidA}</option><option>{uidB}</option></select></label>
    <label>計算課題<select aria-label="計算課題" value={task} onChange={event => setTask(event.target.value)}>{["①", "②", "③", "④", "⑤", "⑥", "⑦"].map(id => <option key={id}>{id}</option>)}</select></label>
    <button onClick={() => setView(view === "input" ? "records" : "input")}>{view === "input" ? "実績" : "学習"}</button>
    <button disabled={running} onClick={() => setStudy(!study)}>{study ? "通常学習STOP" : "通常学習START"}</button>
    <button onClick={() => { setSaved(""); void getDocsFromServer(getCalculationAttempts(db, familyId, uid, getJstDateKey())).then(snapshot => setSaved(JSON.stringify(snapshot.docs.map(doc => doc.data()).sort((a, b) => a.attemptNo - b.attemptNo)))); }}>保存値を確認</button>
    <output className="block break-all" aria-label="保存値">{saved}</output>
    {view === "input" ? <CalculationInput key={`${uid}-${task}`} db={db} familyId={familyId} uid={uid} sample={false} sampleAttempts={[]} onSampleSave={() => {}} diagnostic={false} taskId={`calc-${task}`} taskLabel={`第1回 / 計算${task}`} blocked={study} onRunningChange={setRunning} /> : <DailyCalculation key={uid} db={db} familyId={familyId} uid={uid} sample={false} sampleAttempts={[]} />}
  </main>;
};
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
