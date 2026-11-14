import { useEffect, useRef, useState } from "react";
import { getJstDay, type Progress, type Question } from "./model";
import { resolveDailySelection } from "./daily-selection-cache";
import type { TargetPlan } from "./target-plan";

export function useDailySelection(key: string, questions: Question[], progress: Progress[], plan: TargetPlan | null, now: number, ready: boolean) {
  const day = getJstDay(now);
  const signature = JSON.stringify([key, day, questions.map(q => [q.id, q.version]), plan, progress]);
  const memory = useRef<{ key: string; raw: string; unsaved: boolean } | null>(null);
  const [state, setState] = useState<{ signature: string; result: ReturnType<typeof resolveDailySelection>; warning: string } | null>(null);
  useEffect(() => {
    if (!ready) return;
    let current = true;
    async function readSelection() {
      let raw = memory.current?.key === key ? memory.current.raw : null, warning = "";
      const storageWarning = "この端末に今日の復習の選択を固定できません。再読込で変わる場合があります。";
      try { const stored = localStorage.getItem(key); if (memory.current?.key !== key || !memory.current.unsaved) raw = stored ?? raw; } catch { warning = storageWarning; }
      const result = resolveDailySelection(raw, questions, progress, plan, now);
      memory.current = { key, raw: result.raw, unsaved: false };
      try { localStorage.setItem(key, result.raw); } catch { memory.current.unsaved = true; warning = storageWarning; }
      return { signature, result, warning };
    }
    void readSelection().then(next => { if (current) setState(next); });
    return () => { current = false; };
  }, [key, questions, progress, plan, day, now, ready, signature]);
  return ready && state?.signature === signature ? state : null;
}
