// Isolated local fixture. No Firebase client or production data.
import { StrictMode, useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalculationInput } from "../src/components/DailyCalculation";
import { TestReview } from "../src/components/TestReview";
import { useStudyObserver } from "../src/use-study-observer";
import { getElapsedSeconds } from "../src/study-utils";
import type { SessionTask } from "../src/study-session";
import "../src/index.css";

export function Harness() {
  const [view, setView] = useState("review"), [running, setRunning] = useState(false);
  const [task, setTask] = useState<SessionTask>(() => ({ id: "local-task", unit: "fixture", subject: "math", status: "in_progress", currentDuration: 0, sessionStartTime: Date.now(), lastUserActivityAt: Date.now(), sessionId: "local-session", isRunning: true, history: [] }));
  const tasks = useRef([task]);
  const apply = useCallback((id: string, updates: Partial<SessionTask>) => { tasks.current = tasks.current.map(t => t.id === id ? { ...t, ...updates } : t); setTask(tasks.current[0]); }, []);
  const sync = useCallback(() => {}, []);
  useStudyObserver(tasks, apply, sync);
  return <main>
    <button onClick={() => setView("review")}>Review fixture</button><button onClick={() => setView("calculation")}>Calculation fixture</button>
    <output aria-label="study state" style={{ display: "block", overflowWrap: "anywhere" }}>{JSON.stringify({ ...task, elapsed: getElapsedSeconds(task) })}</output>
    {view === "review" ? <TestReview db={null} familyId="fixture" uid="fixture" sample enabled tests={[{ name: "Fixture exam", date: "2026/11/15", type: "curriculum" }]} />
      : <><output aria-label="calculation running">{String(running)}</output><CalculationInput db={null} familyId="fixture" uid="fixture" sample={false} sampleAttempts={[]} onSampleSave={() => {}} diagnostic={false} taskId="fixture-calc" taskLabel="fixture" blocked={false} onRunningChange={setRunning} /></>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
