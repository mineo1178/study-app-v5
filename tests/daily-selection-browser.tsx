// Fictional fixtures only; no Firebase connection.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { sampleQuestions, type Progress } from "../src/review/model";
import { useDailySelection } from "../src/review/use-daily-selection";
const pool = Array.from({ length: 20 }, (_, i) => ({ ...sampleQuestions[0], id: `fixture-${i}`, unit: `fixture-${i}` }));
export function Harness() {
  const [account, setAccount] = useState("a"), [now, setNow] = useState(Date.parse("2026-11-11T23:59:59+09:00"));
  const [questions, setQuestions] = useState(pool), [progress, setProgress] = useState<Progress[]>([]), [ready, setReady] = useState(true);
  const state = useDailySelection(`daily-fixture:${account}`, questions, progress, null, now, ready);
  const selected = state?.result.selected.map(c => c.question) ?? [];
  return <>
    <output aria-label="selection">{JSON.stringify({ account, questions: selected, warning: state?.warning ?? "" })}</output>
    <button onClick={() => setAccount(account === "a" ? "b" : "a")}>Switch account</button>
    <button onClick={() => setNow(now + 1000)}>Next second</button>
    <button onClick={() => setProgress([{ questionId: "unrelated", latestAt: now - 86400000 } as Progress])}>Update progress</button>
    <button onClick={() => setQuestions(questions.filter(q => q.id !== selected[0]?.id))}>Delete selected</button>
    <button onClick={() => setQuestions(questions.map(q => q.id === selected[0]?.id ? { ...q, version: "changed" } : q))}>Change version</button>
    <button onClick={() => setReady(!ready)}>Toggle ready</button>
  </>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
