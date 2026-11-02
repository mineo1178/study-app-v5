import { useEffect, useRef, useState } from "react";
import { adaptStudyPlan, bindingStillMatches, parseBindings, parseStudyPlan, updateRevision, type RevisionLedger } from "./exchange-plan";
import { parseTargetPlan, type TargetPlan } from "./target-plan";
import type { Question } from "./model";
type Store = { storeVersion: 1; activePlan: TargetPlan | null; ledger: RevisionLedger };
function read(key: string): Store {
  const raw = localStorage.getItem(key);
  if (!raw) return { storeVersion: 1, activePlan: null, ledger: {} };
  if (raw.length > 2000000) throw new Error("保存計画が大きすぎます。");
  const value = JSON.parse(raw);
  if (value.storeVersion !== 1) return { storeVersion: 1, activePlan: parseTargetPlan(raw), ledger: {} };
  if (!value.ledger || typeof value.ledger !== "object" || Array.isArray(value.ledger) || Object.values(value.ledger as RevisionLedger).some(v => !v || !Number.isSafeInteger(v.revision) || v.revision < 1 || typeof v.canonical !== "string")) throw new Error("保存したrevision情報を確認してください。");
  return value as Store;
}
export function useReviewPlan(key: string, questions: Question[], dataLoading: boolean) {
  const [plan, setPlan] = useState<TargetPlan | null>(null), [restoring, setRestoring] = useState(true), [error, setError] = useState("");
  const mounted = useRef(false), generation = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (dataLoading) return;
    let current = true; const version = ++generation.current;
    const restore = async () => {
      const saved = read(key), old = saved.activePlan;
      if (!old?.integration) return old ? parseTargetPlan(JSON.stringify(old)) : null;
      const source = parseStudyPlan(JSON.stringify(old.integration.source), questions);
      updateRevision(saved.ledger, source);
      const valid = old.integration.bindings.filter(b => bindingStillMatches(b, source, questions));
      const bindings = await parseBindings(JSON.stringify({ schemaVersion: "review-question-bindings/1", planId: source.planId, bindings: valid }), source, questions);
      return adaptStudyPlan(source, bindings, questions, old.integration.importedAt, old.integration.mappingsImportedAt);
    };
    void restore().then(next => { if (current && generation.current === version) { setPlan(next); setError(""); } }).catch(() => { if (current && generation.current === version) { setPlan(null); setError("保存した計画を検証できません。元の計画と対応表を読み直してください。復習履歴は残っています。"); } }).finally(() => { if (current && generation.current === version) setRestoring(false); });
    return () => { current = false; };
  }, [key, questions, dataLoading]);
  useEffect(() => {
    const refresh = (e: StorageEvent) => { if (e.key === key) { setError("別タブで計画が更新されました。再読込して新しいrevisionを確認してください。"); } };
    window.addEventListener("storage", refresh); return () => window.removeEventListener("storage", refresh);
  }, [key]);
  async function importFile(raw: string, kind: "plan" | "bindings", at: number) {
    const version = ++generation.current;
    const saved = read(key); let next: TargetPlan;
    if (kind === "bindings") {
      const integration = plan?.integration;
      if (!integration) throw new Error("先にschemaVersion 1.0.0の計画を読み込んでください。");
      const bindings = await parseBindings(raw, integration.source, questions);
      next = adaptStudyPlan(integration.source, bindings, questions, integration.importedAt, at);
    } else if (JSON.parse(raw)?.schemaVersion === "1.0.0") {
      const source = parseStudyPlan(raw, questions);
      updateRevision(saved.ledger, source);
      const previous = saved.activePlan?.integration;
      const retained = previous?.source.planId === source.planId ? previous.bindings.filter(b => bindingStillMatches(b, source, questions)) : [];
      const bindings = await parseBindings(JSON.stringify({ schemaVersion: "review-question-bindings/1", planId: source.planId, bindings: retained }), source, questions);
      next = adaptStudyPlan(source, bindings, questions, at, previous?.mappingsImportedAt);
    } else {
      next = parseTargetPlan(raw);
      if (next.items.some(i => !questions.some(q => q.id === i.questionId && q.version === i.questionVersion))) throw new Error("未知・変更済みの問題IDがあります。");
    }
    if (!mounted.current || generation.current !== version) return;
    // Reread immediately before the one synchronous write, including other tabs' high-water marks.
    const fresh = read(key), ledger = next.integration ? updateRevision(fresh.ledger, next.integration.source) : fresh.ledger;
    localStorage.setItem(key, JSON.stringify({ storeVersion: 1, activePlan: next, ledger } satisfies Store));
    setPlan(next); setError(""); setRestoring(false);
  }
  function clear() {
    ++generation.current; const saved = read(key);
    localStorage.setItem(key, JSON.stringify({ ...saved, activePlan: null })); setPlan(null); setError("");
  }
  return { plan, restoring, error, importFile, clear };
}
