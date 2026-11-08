import { useRef, useState } from "react";
import { hasReflection, reflectionFields, reflectionSubjects, type TestReflection } from "../test-reflection";

const subjects = { math: "算数", japanese: "国語", science: "理科", social: "社会" };
const fields = { good: "よかった点", bad: "悪かった点", nextTry: "次回に向けてTryすること" };

type Test = { id: string; name: string; date: string; reflection?: TestReflection };
type Draft = { original: TestReflection; values: TestReflection };

export function TestReflections({ tests, onSave }: {
  tests: Test[];
  onSave: (id: string, original: TestReflection, draft: TestReflection) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [subject, setSubject] = useState<typeof reflectionSubjects[number]>("math");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saving = useRef(false);
  const selector = useRef<HTMLSelectElement>(null);
  const ordered = [...tests].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const selected = ordered.find(test => test.id === selectedId);
  const history = ordered.filter(test => hasReflection(test.reflection));
  const draft = drafts[selectedId];
  const values = draft?.values ?? selected?.reflection ?? {};
  const busy = status === "saving";

  function selectTest(id: string) {
    setSelectedId(id);
    setSubject("math");
    setStatus("idle");
  }

  async function save() {
    if (!selected || !draft || !hasReflection(values) || saving.current) return;
    saving.current = true;
    setStatus("saving");
    try {
      await onSave(selected.id, draft.original, draft.values);
      setDrafts(current => {
        const next = { ...current };
        delete next[selected.id];
        return next;
      });
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      saving.current = false;
    }
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-slate-700">
      <h3 className="font-bold">テストの振り返り</h3>
      {ordered.length === 0 ? <p className="text-sm">テスト記録を追加すると、振り返りを書けます。</p> : (
        <label className="block text-sm font-medium">
          振り返るテスト
          <select ref={selector} value={selected?.id ?? ""} disabled={busy} onChange={event => selectTest(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-base">
            <option value="">テストを選ぶ</option>
            {ordered.map(test => <option key={test.id} value={test.id}>{test.date} {test.name}{drafts[test.id] ? "（保存前）" : ""}</option>)}
          </select>
        </label>
      )}
      {selected && (
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
          <div className="grid grid-cols-4 gap-1" role="group" aria-label="教科">
            {reflectionSubjects.map(key => (
              <button key={key} type="button" aria-pressed={subject === key} onClick={() => setSubject(key)}
                className={`min-h-11 rounded-lg text-sm font-bold ${subject === key ? "bg-blue-600 text-white" : "bg-slate-100"}`}>
                {subjects[key]}
              </button>
            ))}
          </div>
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            {reflectionFields.map(field => (
              <label key={field} className="block text-sm font-medium">
                {fields[field]}
                <textarea value={values[subject]?.[field] ?? ""} rows={3} maxLength={1000}
                  onChange={event => {
                    const value = event.target.value;
                    setDrafts(current => ({
                      ...current,
                      [selected.id]: {
                        original: draft?.original ?? selected.reflection ?? {},
                        values: { ...values, [subject]: { ...values[subject], [field]: value } },
                      },
                    }));
                    setStatus("idle");
                  }}
                  className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-base" />
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={busy || !draft || !hasReflection(values)}
            className="min-h-11 rounded-lg bg-blue-600 px-4 font-bold text-white disabled:opacity-50">
            {busy ? "保存中…" : status === "error" ? "もう一度保存する" : "振り返りを保存"}
          </button>
          {draft && !hasReflection(values) && <p className="text-sm">1項目以上書くと保存できます。</p>}
          {status === "saved" && <p role="status" className="text-sm text-emerald-700">振り返りを保存しました。</p>}
          {status === "error" && <p role="alert" className="text-sm text-red-700">保存できませんでした。入力は残っています。接続を確認して、もう一度お試しください。</p>}
        </form>
      )}
      <h4 className="text-sm font-bold">振り返りの履歴</h4>
      {history.length === 0 && <p className="text-sm">保存した振り返りがここに表示されます。</p>}
      {history.map(test => (
        <details key={test.id} className="min-w-0 rounded-xl border border-slate-200 px-3">
          <summary className="min-h-11 cursor-pointer break-words py-2 font-bold">
            {test.date} {test.name}
            <span className="block text-sm font-medium text-slate-600">
              {reflectionSubjects.filter(key => hasReflection({ [key]: test.reflection?.[key] })).map(key => subjects[key]).join("・")}
            </span>
          </summary>
          <div className="space-y-3 pb-3">
            {reflectionSubjects.map(key => (
              <div key={key} className="rounded-lg bg-slate-50 p-3">
                <h5 className="font-bold">{subjects[key]}</h5>
                <dl className="space-y-2 text-sm">
                  {reflectionFields.map(field => (
                    <div key={field}>
                      <dt className="font-medium">{fields[field]}</dt>
                      <dd className="whitespace-pre-wrap break-words">{test.reflection?.[key]?.[field] || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <button type="button" disabled={busy} onClick={() => { selectTest(test.id); selector.current?.focus(); }}
              className="min-h-11 rounded-lg bg-blue-50 px-4 font-bold text-blue-700 disabled:opacity-50">
              この振り返りを編集
            </button>
          </div>
        </details>
      ))}
    </section>
  );
}
