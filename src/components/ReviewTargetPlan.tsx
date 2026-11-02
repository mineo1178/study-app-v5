import type { TargetPlan } from "../review/target-plan";
import { useRef, useState } from "react";

export function ReviewTargetPlan({ plan, onImport, onClear, onError, disabled }: { plan: TargetPlan | null; onImport: (raw: string, kind: "plan" | "bindings") => Promise<void>; onClear: () => void; onError: (message: string) => void; disabled: boolean }) {
  const [importing, setImporting] = useState(false), pending = useRef(false);
  const [completed, setCompleted] = useState(0);
  const fileInput = (label: string, kind: "plan" | "bindings") => <label className="my-3 block">{label}<input aria-label={label} disabled={disabled || importing} className="mt-1 block w-full min-w-0 text-xs" type="file" accept=".json,application/json" onChange={async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || pending.current) return;
    pending.current = true; setImporting(true);
    try { if (file.size > 900000) throw new Error("計画が大きすぎます。"); await onImport(await file.text(), kind); }
    catch (error) { onError((error as Error).message); }
    finally { pending.current = false; setImporting(false); setCompleted(n => n + 1); }
  }} /></label>;
  return <details data-review-import-completed={completed} className="space-y-2 rounded-2xl bg-white p-4 text-sm">
    <summary className="cursor-pointer font-bold">この端末のテスト対策計画</summary>
    <p className="mt-2">成績や元資料はアプリに組み込みません。保護者が資料と照合した計画を、この利用者・端末だけに読み込みます。Firestoreには送信しません。</p>
    <p>端末間の自動同期はありません。更新時は新しいrevisionのJSONを選びます。非公開の根拠ファイルは取り込みません。</p>
    {fileInput("根拠付き対策計画", "plan")}
    {importing && <p role="status">計画を確認中…</p>}
    {plan?.integration && fileInput("内容照合済み問題対応表", "bindings")}
    {plan ? <><p className="font-bold">{plan.label}（{plan.testDay}）</p>
      {plan.integration && <><p>計画revision：{plan.integration.source.revision} ／ 取込：{new Date(plan.integration.importedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（JST）</p><p>問題対応表：{plan.integration.bindings.length}件・{new Set(plan.integration.bindings.map(b => b.questionId)).size}問。全{plan.integration.source.topics.length}単元のうち、未対応は{plan.integration.source.topics.filter(t => !plan.integration!.bindings.some(b => b.topicId === t.topicId)).length}単元です。部分対応も下に区別して表示します。</p>
        <details><summary>全単元の問題紐付け状況</summary>{plan.integration.source.topics.map(t => { const bs = plan.integration!.bindings.filter(b => b.topicId === t.topicId && plan.items.some(i => i.questionId === b.questionId)); return <p className="my-2" key={t.topicId}>{t.title}：{bs.some(b => b.coverage === "verified") ? "対応確認済み" : bs.length ? "一部対応・補助確認" : "対応問題なし／未確認"}</p>; })}</details></>}
      {plan.notes.map((note, i) => <p className="mt-1" key={i}>{note}</p>)}
      <p className="mt-3 font-bold">今の問題だけでは確認できないこと</p>
      <ul className="list-disc space-y-1 pl-5">{plan.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>
      <button disabled={disabled || importing} className="mt-3 rounded-xl border px-3 py-2" onClick={() => { try { onClear(); } catch { onError("計画を外せませんでした。"); } }}>この端末の計画を外す</button>
    </> : <p>計画は未設定です。登録問題の復習期限だけで選び、次回テストに合う問題・苦手克服とは判定しません。</p>}
  </details>;
}
