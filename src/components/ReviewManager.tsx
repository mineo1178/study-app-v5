import { useRef, useState } from "react";
import { SUBJECTS, TEST_KINDS, parseQuestions, validateQuestion, validateWeakness, type Question, type Subject, type Weakness } from "../review/model";

const field = "block w-full min-w-0 rounded-xl border border-slate-300 bg-white p-2 text-sm font-normal";
const button = "rounded-xl bg-slate-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-40";
const blankQuestion = (): Question => ({ published: true, id: crypto.randomUUID(), version: crypto.randomUUID(), subject: "math", unit: "", prompt: "", choices: ["", "", "", ""], correctIndex: 0, explanation: "", testKind: "未指定", source: "" });
const blankWeakness = (): Weakness => ({ id: crypto.randomUUID(), subject: "math", unit: "", mistake: "", point: "", testKind: "未指定", questionIds: [] });
export function ReviewManager({ questions, weaknesses, onQuestions, onWeakness, busy }: {
  questions: Question[]; weaknesses: Weakness[]; busy: boolean;
  onQuestions: (q: Question[]) => Promise<boolean>; onWeakness: (w: Weakness) => Promise<boolean>;
}) {
  const [question, setQuestion] = useState(blankQuestion);
  const [weakness, setWeakness] = useState(blankWeakness);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const importBatch = useRef<{ input: string; questions: Question[] } | null>(null);
  const choose = (value: string) => setQuestion(questions.find(q => q.id === value) ?? blankQuestion());
  return <details className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-100 p-4">
    <summary className="cursor-pointer font-bold">保護者の操作：問題登録・編集／苦手分野</summary>
    <p className="my-3 text-xs text-slate-600">管理者から割り当てられた子どもの問題を管理します。回答履歴・復習進捗は変更できません。サンプルモードの変更は端末内だけです。</p>
    {error && <p role="alert" className="my-2 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="my-2 text-sm text-emerald-700">{notice}</p>}
    <fieldset disabled={busy} className="min-w-0 space-y-3 disabled:opacity-50">
      <legend className="mb-2 font-bold">四択問題</legend>
      <label className="block text-sm">編集する問題<select aria-label="編集する問題" className={field} value={questions.some(q => q.id === question.id) ? question.id : ""} onChange={e => choose(e.target.value)}><option value="">新しく登録</option>{questions.map(q => <option key={q.id} value={q.id}>{SUBJECTS[q.subject]}／{q.unit}：{q.prompt.slice(0, 25)}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={question.published === true} onChange={e => setQuestion({ ...question, published: e.target.checked })} />子どもに公開する（未設定の旧問題は非公開）</label>
      <label className="block text-sm">教科<select className={field} value={question.subject} onChange={e => setQuestion({ ...question, subject: e.target.value as Subject })}>{Object.entries(SUBJECTS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="block text-sm">単元<input className={field} maxLength={100} value={question.unit} onChange={e => setQuestion({ ...question, unit: e.target.value })} /></label>
      <label className="block text-sm">問題文<textarea aria-label="問題文" className={field} maxLength={1000} value={question.prompt} onChange={e => setQuestion({ ...question, prompt: e.target.value })} /></label>
      {question.choices.map((choice, index) => <label key={index} className="block text-sm">選択肢{index + 1}<input className={field} maxLength={300} value={choice} onChange={e => setQuestion({ ...question, choices: question.choices.map((c, i) => i === index ? e.target.value : c) })} /></label>)}
      <label className="block text-sm">正解<select className={field} value={question.correctIndex} onChange={e => setQuestion({ ...question, correctIndex: Number(e.target.value) })}>{[0, 1, 2, 3].map(i => <option key={i} value={i}>選択肢{i + 1}</option>)}</select></label>
      <label className="block text-sm">短い解説<textarea aria-label="短い解説" className={field} maxLength={1000} value={question.explanation} onChange={e => setQuestion({ ...question, explanation: e.target.value })} /></label>
      <label className="block text-sm">関連テスト<select className={field} value={question.testKind} onChange={e => setQuestion({ ...question, testKind: e.target.value })}>{TEST_KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
      <label className="block text-sm">出典・元テスト／設問（任意）<input className={field} maxLength={300} value={question.source} onChange={e => setQuestion({ ...question, source: e.target.value })} /></label>
      <button className={button} onClick={() => {
        setError(""); setNotice("");
        const q = { ...question, published: question.published === true, unit: question.unit.trim(), choices: question.choices.map(c => c.trim()), version: crypto.randomUUID() };
        try { validateQuestion(q); } catch (e) { setError((e as Error).message); return; }
        void onQuestions([q]).then(ok => { if (ok) { setQuestion(blankQuestion()); setNotice("問題を登録しました。"); } });
      }}>問題を保存</button>
      <details className="min-w-0 rounded-xl bg-white p-3">
        <summary className="cursor-pointer text-sm font-bold">まとめて取り込む（JSON・50問まで）</summary>
        <p className="my-2 text-xs">subject（math/japanese/science/social）, unit, prompt, choices（4件）, correctIndex（0〜3）, explanation, testKind（未指定/判定/組分け/カリテ/その他）, source を持つ配列。IDは自動発行。実際の問題だけを貼り付けてください。</p>
        <textarea aria-label="問題JSON" className={field} rows={6} maxLength={200000} value={input} onChange={e => setInput(e.target.value)} />
        <button className={`${button} mt-2`} onClick={() => {
          setError(""); setNotice("");
          let items: Question[];
          try {
            if (importBatch.current?.input === input) items = importBatch.current.questions;
            else { items = parseQuestions(input); importBatch.current = { input, questions: items }; }
          } catch (e) { setError((e as Error).message); return; }
          void onQuestions(items).then(ok => { if (ok) { setInput(""); setNotice(`${items.length}問を登録しました。`); } });
        }}>JSONを取り込む</button>
      </details>
    </fieldset>
    <fieldset disabled={busy} className="mt-6 min-w-0 space-y-3 disabled:opacity-50">
      <legend className="mb-2 font-bold">保護者が確認した苦手分野</legend>
      <label className="block text-sm">編集する苦手分野<select className={field} value={weaknesses.some(w => w.id === weakness.id) ? weakness.id : ""} onChange={e => setWeakness(weaknesses.find(w => w.id === e.target.value) ?? blankWeakness())}><option value="">新しく登録</option>{weaknesses.map(w => <option key={w.id} value={w.id}>{SUBJECTS[w.subject]}／{w.unit}</option>)}</select></label>
      <label className="block text-sm">苦手の教科<select className={field} value={weakness.subject} onChange={e => setWeakness({ ...weakness, subject: e.target.value as Subject })}>{Object.entries(SUBJECTS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      {([['unit', '苦手の単元', 100], ['mistake', '間違えた内容', 1000], ['point', '復習したいポイント', 1000]] as const).map(([key, label, max]) => <label key={key} className="block text-sm">{label}<textarea aria-label={label} className={field} maxLength={max} value={weakness[key]} onChange={e => setWeakness({ ...weakness, [key]: e.target.value })} /></label>)}
      <label className="block text-sm">苦手の関連テスト<select className={field} value={weakness.testKind} onChange={e => setWeakness({ ...weakness, testKind: e.target.value })}>{TEST_KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
      <fieldset className="min-w-0"><legend className="text-sm">対応する問題（5問まで）</legend>{questions.map(q => <label key={q.id} className="my-1 flex items-start gap-2 break-words text-xs"><input type="checkbox" checked={weakness.questionIds.includes(q.id)} onChange={e => setWeakness({ ...weakness, questionIds: e.target.checked ? [...weakness.questionIds, q.id] : weakness.questionIds.filter(id => id !== q.id) })} /><span className="min-w-0 break-words">{q.unit}：{q.prompt}</span></label>)}</fieldset>
      <button className={button} onClick={() => {
        setError(""); setNotice("");
        try { validateWeakness(weakness); } catch (e) { setError((e as Error).message); return; }
        void onWeakness(weakness).then(ok => { if (ok) { setWeakness(blankWeakness()); setNotice("苦手分野を保存しました。"); } });
      }}>苦手分野を保存</button>
    </fieldset>
  </details>;
}
