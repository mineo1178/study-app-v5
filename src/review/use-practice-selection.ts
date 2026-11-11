import { useEffect, useState } from "react";
import { getJstDay, type Answer, type Question } from "./model";
import { practiceSelection, type TargetPlan } from "./target-plan";
// Only opaque question IDs/versions are cached, scoped to the authenticated user.
export function usePracticeSelection(key: string, questions: Question[], history: Answer[], plan: TargetPlan | null, now: number, ready: boolean) {
  const day = getJstDay(now);
  const signature = JSON.stringify([day, plan?.testDay ?? null, plan?.items.map(i => [i.questionId, i.questionVersion]) ?? null]);
  const [state, setState] = useState<{ signature: string; questions: Question[]; warning: string }>({ signature: "", questions: [], warning: "" });
  useEffect(() => {
    if (!ready) return;
    let current = true;
    async function readSelection() {
      const fallback = practiceSelection(questions, history, plan, Date.parse(day));
      try {
        const raw = localStorage.getItem(key);
        const saved = raw ? JSON.parse(raw) : null;
        const restored = saved?.signature === signature && Array.isArray(saved.ids) ? saved.ids.map((i: { id: string; version: string }) => questions.find(q => q.id === i.id && q.version === i.version)) : [];
        if (restored.length === Math.min(5, questions.length) && restored.every(Boolean) && new Set(restored.map((q: Question) => q.id)).size === restored.length) return { signature, questions: restored as Question[], warning: "" };
        localStorage.setItem(key, JSON.stringify({ signature, ids: fallback.map(q => ({ id: q.id, version: q.version })) }));
        return { signature, questions: fallback, warning: "" };
      } catch { return { signature, questions: fallback, warning: "この端末に追加練習の選択を固定できません。再読込で変わる場合があります。" }; }
    }
    void readSelection().then(next => { if (current) setState(next); });
    return () => { current = false; };
  }, [key, questions, history, plan, day, ready, signature]);
  return state.signature === signature ? state : { signature, questions: [], warning: "" };
}
