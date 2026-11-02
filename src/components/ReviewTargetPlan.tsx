import { parseTargetPlan, type TargetPlan } from "../review/target-plan";

export function ReviewTargetPlan({ plan, onChange, onError, disabled }: { plan: TargetPlan | null; onChange: (plan: TargetPlan | null) => void; onError: (message: string) => void; disabled: boolean }) {
  return <details className="space-y-2 rounded-2xl bg-white p-4 text-sm">
    <summary className="cursor-pointer font-bold">この端末のテスト対策計画</summary>
    <p className="mt-2">成績や元資料はアプリに組み込みません。保護者が資料と照合した計画を、この利用者・端末だけに読み込みます。Firestoreには送信しません。</p>
    <label className="my-3 block">根拠付き対策計画（JSON）<input aria-label="根拠付き対策計画" disabled={disabled} className="mt-1 block w-full min-w-0 text-xs" type="file" accept=".json,application/json" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file) return;
      try { if (file.size > 150000) throw new Error("対策計画が大きすぎます。"); onChange(parseTargetPlan(await file.text())); }
      catch (error) { onError((error as Error).message); }
    }} /></label>
    {plan ? <><p className="font-bold">{plan.label}（{plan.testDay}）</p>
      {plan.notes.map((note, i) => <p className="mt-1" key={i}>{note}</p>)}
      <p className="mt-3 font-bold">今の問題だけでは確認できないこと</p>
      <ul className="list-disc space-y-1 pl-5">{plan.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>
      <button disabled={disabled} className="mt-3 rounded-xl border px-3 py-2" onClick={() => onChange(null)}>この端末の計画を外す</button>
    </> : <p>計画は未設定です。登録問題の復習期限だけで選び、次回テストに合う問題・苦手克服とは判定しません。</p>}
  </details>;
}
