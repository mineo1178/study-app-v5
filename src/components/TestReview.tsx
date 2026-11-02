import { useEffect, useRef, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { FamilySession } from "../use-family-session";
import { SUBJECTS, createReviewDraft, visibleQuestions, answerQuestion, getJstDay, nextProgress, progressLabel, restoreDraft, sampleQuestions, reviewDueAt, type Draft, type Question, type Weakness } from "../review/model";
import { activeTargetPlan, targetCandidates } from "../review/target-plan";
import { useReviewPlan } from "../review/use-review-plan";
import { ReviewTargetPlan } from "./ReviewTargetPlan";
import { loadReview, saveReview, type ReviewData } from "../review/repository";
import { ReviewManager } from "./ReviewManager";

const empty: ReviewData = { questions: [], weaknesses: [], progress: [], history: [] };
const primary = "rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-40";
const secondary = "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold disabled:opacity-40";
function readLocal(key: string) { try { return { raw: localStorage.getItem(key), error: "" }; } catch { return { raw: null, error: "この端末に途中経過を保存できません。再読込前に結果を保存してください。" }; } }

export function TestReview({ db, familyId, uid, sample, session, enabled }: { db: Firestore | null; familyId: string; uid: string; sample: boolean; session?: FamilySession; enabled: boolean }) {
  const scope = `${db?.app.options.projectId ?? "sample"}:${familyId}:${uid}:${sample ? "sample" : "live"}`;
  const draftKey = `study-review-v1:${scope}:draft`, dataKey = `study-review-v1:${scope}:sample-data`;
  const [draftState, setDraftState] = useState(() => { const saved = readLocal(draftKey); return { draft: restoreDraft(saved.raw, uid), warning: saved.error }; });
  const draft = draftState.draft;
  const planKey = `study-review-v1:${scope}:target-plan`;
  const [data, setData] = useState<ReviewData>(() => {
    if (sample) { try { const saved = readLocal(dataKey).raw; if (saved) return JSON.parse(saved) as ReviewData; } catch { /* Reset only fictional sample data. */ } return { ...empty, questions: sampleQuestions }; }
    return empty;
  });
  const [loading, setLoading] = useState(!sample && enabled);
  const planState = useReviewPlan(planKey, data.questions, loading);
  const plan = planState.plan;
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const pending = useRef(false), mounted = useRef(true);
  const active = () => mounted.current && (sample || !!session?.active());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (sample || !enabled || !db || !session) return;
    let current = true;
    void loadReview(db, familyId, uid).then(value => {
      if (current && session.active()) { setData(value); setError(""); }
    }).catch(() => { if (current && session.active()) setError("復習データを読み込めませんでした。通信・利用権限を確認して再読込してください。"); })
      .finally(() => { if (current && session.active()) setLoading(false); });
    return () => { current = false; };
  }, [db, familyId, uid, sample, session, enabled, reload]);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, draft && draft.finishedAt === null ? 1000 : 60000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [draft]);
  function persistDraft(next: Draft | null) {
    let warning = "";
    try { if (next) localStorage.setItem(draftKey, JSON.stringify(next)); else localStorage.removeItem(draftKey); }
    catch { warning = "この端末に途中経過を保存できません。再読込前に結果を保存してください。"; }
    setDraftState({ draft: next, warning });
  }
  function updateSample(next: ReviewData) {
    localStorage.setItem(dataKey, JSON.stringify(next));
    setData(next);
  }
  function begin(questions: Question[], mode: Draft["mode"]) {
    if (!questions.length || pending.current || !active() || planState.error || planState.restoring) return;
    const started = createReviewDraft(uid, questions, mode);
    const picked = mode === "daily" ? targetCandidates(questions, data.progress, plan, started.startedAt).map(c => c.question) : questions;
    if (!picked.length) { setNow(started.startedAt); return; }
    const next = { ...started, questions: picked }; setNow(next.startedAt); setSaved(false); setSelected(null); setDiscard(false); setError("");
    persistDraft(next);
  }
  async function storeResult() {
    if (!draft?.finishedAt || pending.current || !active()) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (sample) {
        const fresh = draft.answers.filter(a => !data.history.some(h => h.id === a.id));
        // Keep progress for every question, including ones outside this session.
        const all = new Map(data.progress.map(p => [p.questionId, p]));
        for (const a of fresh) all.set(a.questionId, nextProgress(all.get(a.questionId), a));
        updateSample({ ...data, progress: [...all.values()], history: [...fresh, ...data.history].sort((a, b) => b.answeredAt - a.answeredAt).slice(0, 50) });
      } else {
        if (!db) throw new Error("保存先を確認できません。");
        await saveReview(db, familyId, uid, draft, active);
        if (!active()) return;
        setData(await loadReview(db, familyId, uid));
      }
      if (active()) setSaved(true);
    } catch (e) { if (active()) setError(`保存できませんでした。途中までの保存も再試行で重複しません。${(e as Error).message}`); }
    finally { pending.current = false; if (active()) setBusy(false); }
  }
  async function manage(work: () => Promise<void>) {
    if (pending.current || !active()) return false;
    pending.current = true; setBusy(true); setError("");
    try { await work(); return active(); }
    catch (e) { if (active()) setError(`登録できませんでした。${(e as Error).message}`); return false; }
    finally { pending.current = false; if (active()) setBusy(false); }
  }
  async function registerQuestions(questions: Question[]) {
    return manage(async () => {
      const merged = new Map(data.questions.map(q => [q.id, q]));
      for (const q of questions) {
        if (data.questions.some(old => old.id !== q.id && old.subject === q.subject && old.unit === q.unit && old.prompt === q.prompt)) throw new Error("同じ問題が登録されています。編集する問題から選んでください。");
        merged.set(q.id, q);
      }
      if (merged.size > 200) throw new Error("初期版では200問まで登録できます。");
      if (sample) updateSample({ ...data, questions: [...merged.values()] });
      else throw new Error("問題管理はPCの管理者用ツールを使用してください。");
    });
  }
  async function registerWeakness(weakness: Weakness) {
    return manage(async () => {
      const merged = [...data.weaknesses.filter(w => w.id !== weakness.id), weakness];
      if (merged.length > 100) throw new Error("初期版では100件まで登録できます。");
      if (sample) updateSample({ ...data, weaknesses: merged });
      else throw new Error("苦手情報の管理はPCの管理者用ツールを使用してください。");
    });
  }
  const todayCount = data.history.filter(a => getJstDay(a.answeredAt) === getJstDay(now)).length;
  const availableQuestions = visibleQuestions(data.questions, sample);
  const wrong = availableQuestions.filter(q => data.progress.some(p => p.questionId === q.id && p.questionVersion === q.version && !p.latestCorrect));
  const candidates = targetCandidates(availableQuestions, data.progress, plan, now);
  const activePlan = activeTargetPlan(plan, now);
  function beginDaily(wrongOnly = false) {
    begin(wrongOnly ? wrong : availableQuestions, "daily");
  }
  const time = (ms: number) => `${Math.floor(ms / 60000)}分${Math.floor(ms / 1000) % 60}秒`;
  if (!sample && !enabled) return <section className="p-5"><h2 className="text-xl font-black">対策・復習</h2><p className="mt-3">保存機能は公開準備中です。現在はサンプルモードで試せます。</p></section>;
  return <section aria-label="テスト対策・復習" className="mx-auto w-full max-w-3xl space-y-4 break-words p-4 pb-8 md:p-6">
    <h2 className="text-xl font-black text-blue-800">対策・復習</h2>
    {sample && <p className="rounded-xl bg-amber-50 p-3 text-sm">サンプルモード：架空の問題です。実際のテスト結果とは無関係で、この端末だけに保存します。</p>}
    {draftState.warning && <p role="alert" className="text-sm text-amber-800">{draftState.warning}</p>}
    {planState.error && <p role="alert" className="text-sm text-red-700">{planState.error}</p>}
    {error && <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{error}</p>{!draft && <button className={secondary} onClick={() => { setLoading(true); setError(""); setReload(n => n + 1); }}>復習データを再読込</button>}</div>}
    {loading || planState.restoring ? <p role="status">復習データを読み込み中…</p> : draft ? <>
      {draft.finishedAt === null ? <div className="space-y-4 rounded-2xl border border-blue-100 bg-white p-4">
        <p className="text-sm font-bold">{draft.answers.length + 1} / {draft.questions.length} 問 · {time(Math.max(0, now - draft.startedAt))}</p>
        <p className="text-xs text-slate-500">目安は3分。時間を超えても大丈夫。焦らず考えよう。途中経過はこの端末に保存します。</p>
        <p className="text-sm">{SUBJECTS[draft.questions[draft.answers.length].subject]} ／ {draft.questions[draft.answers.length].unit}</p>
        <p className="rounded-xl bg-blue-50 p-3 text-sm">選んだ理由：{plan?.items.find(i => i.questionId === draft.questions[draft.answers.length].id && i.questionVersion === draft.questions[draft.answers.length].version)?.reason ?? "日を空けて、自分で思い出せるか確かめよう。"}</p>
        <h3 className="whitespace-pre-wrap text-lg font-bold">{draft.questions[draft.answers.length].prompt}</h3>
        <div role="group" aria-label="解答候補" className="space-y-2">{draft.questions[draft.answers.length].choices.map((choice, index) => <button key={index} aria-pressed={selected === index} className={`block w-full break-words rounded-xl border-2 p-3 text-left ${selected === index ? "border-blue-600 bg-blue-50" : "border-slate-200"}`} onClick={() => setSelected(index)}>{index + 1}. {choice}</button>)}</div>
        <button className={primary} disabled={selected === null} onClick={() => { if (selected === null) return; const next = answerQuestion(draft, selected, Date.now()); setSelected(null); setNow(Date.now()); persistDraft(next); }}>{draft.answers.length + 1 === draft.questions.length ? "最後の回答を決めて採点" : "回答を決めて次へ"}</button>
      </div> : <div className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4">
        <h3 className="text-xl font-black text-emerald-700">{draft.answers.filter(a => a.correct).length} / {draft.questions.length} 問 正解</h3>
        <p>{time(draft.finishedAt - draft.startedAt)}取り組めたね！ 確認したことを、また思い出してみよう。</p>
        {draft.mode === "retry" && <p className="text-sm text-slate-600">解説を見たあとの再挑戦です。日を空けて解けるかも確認しよう。</p>}
        {draft.answers.map(a => { const previous = data.history.find(h => h.questionId === a.questionId && h.id !== a.id && h.answeredAt < a.answeredAt); return <article key={a.id} className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-bold">{a.correct ? "○ 正解" : "もう一度確認"}：{a.prompt}</p><p>あなたの回答：{a.selected}</p><p>正解：{a.expected}</p><p className="whitespace-pre-wrap">{a.explanation}</p>{saved && (() => { const p = data.progress.find(p => p.questionId === a.questionId && p.questionVersion === a.questionVersion); return p ? <p className="font-bold">次の復習：{getJstDay(reviewDueAt(p))}（JST）</p> : null; })()}
          {previous && <p>前回：{previous.correct ? "正解" : "誤答"} → 今回：{a.correct ? "正解" : "誤答"}（{draft.mode === "retry" ? "直後の再挑戦" : "再確認"}）</p>}
        </article>; })}
        {!saved ? <button className={primary} disabled={busy} onClick={() => { void storeResult(); }}>{busy ? "保存中…" : "結果を保存する（失敗時は再試行）"}</button> : <>
          <p role="status" className="font-bold text-emerald-700">保存しました</p>
          {draft.answers.some(a => !a.correct) && <button className={primary} onClick={() => begin(draft.questions.filter((_, i) => !draft.answers[i].correct), "retry")}>間違えた問題をもう一度</button>}
          <button className={`${secondary} ml-2 mt-2`} onClick={() => { persistDraft(null); setSaved(false); setDiscard(false); }}>復習ホームへ</button>
        </>}
      </div>}
      {!saved && <div className="space-y-2 text-sm"><button disabled={busy} className={secondary} onClick={() => setDiscard(!discard)}>今回はここで終わる</button>{discard && <div className="space-y-2"><p>端末の途中経過を削除します。保存済みの回答は残ります。</p><button disabled={busy} className={secondary} onClick={() => { persistDraft(null); setDiscard(false); setError(""); }}>未保存の回答を破棄してホームへ</button></div>}</div>}
    </> : <>
      <div className="space-y-3 rounded-2xl border border-blue-100 bg-white p-4">
        <h3 className="text-lg font-black">今日の5問</h3><p className="text-sm text-slate-600">最大5問。復習期限が来た問題を先に、次にテストとの関連と確認の優先度で選ぶよ。期限前の問題で数を埋めません。</p>
        <p className="text-sm">利用できる問題：{availableQuestions.length}問 ／ 今日の候補：{candidates.length}問</p>
        {activePlan && <p className="text-sm font-bold">{activePlan.label}（{activePlan.testDay}）向け · この端末の計画</p>}
        {!activePlan && <p className="text-xs text-amber-800">{plan ? "計画の試験日が過ぎたため、一般復習に戻っています。復習期限は変わりません。保護者と次の計画を確認しよう。" : "一般復習：次回テストの範囲は未設定です。保護者の根拠付き計画を読み込むと、対象を絞れます。"}</p>}
        {candidates.map(c => <p key={c.question.id} className="rounded-xl bg-blue-50 p-2 text-sm">{SUBJECTS[c.question.subject]}／{c.question.unit}：{c.reason}（{c.dueAt === null ? "初めての確認" : getJstDay(c.dueAt) + "が復習期限"}）</p>)}
        {!candidates.length && <p className="text-sm">{activePlan ? "今日は期限と対策範囲に合う問題がありません。" : "今日は復習対象の問題がありません。"}無理に追加しなくて大丈夫。</p>}
        <button className={primary} disabled={!candidates.length || !!error || !!planState.error || planState.restoring || busy} onClick={() => beginDaily()}>今日の{candidates.length}問を始める</button>
        <p className="text-xs text-slate-600">間違えたら翌日。同じ日の再挑戦では段階を進めず、別の日に期限を迎えて正解したら3日・7日・14日へ。14日後も確認を続けます。元のテストの苦手を解消した判定ではありません。</p>
        <p className="text-sm" aria-label="今日の復習状況">今日の復習：{todayCount}回答（最近50回答の範囲・JST）／もう一度確認：{wrong.length}問</p>
        {!availableQuestions.length && <p className="text-sm">問題は準備中です。保護者に確認してください。</p>}
        {!sample && <button className={secondary} disabled={busy} onClick={() => { setLoading(true); setReload(n => n + 1); }}>復習データを再読込</button>}
      </div>
      <div className="rounded-2xl bg-white p-4"><h3 className="mb-2 font-bold">苦手分野</h3><p className="mb-2 text-xs text-slate-500">保護者の入力です。教科の点数から単元の苦手を推測しません。小問の正解だけで元の弱点を解消済みにはしません。</p>{!data.weaknesses.length && <p className="text-sm">まだ登録されていません。</p>}{data.weaknesses.map(w => <article key={w.id} className="my-2 space-y-1 rounded-xl bg-slate-50 p-3 text-sm"><p className="font-bold">{SUBJECTS[w.subject]} ／ {w.unit}（{w.testKind}）</p><p>間違えた内容：{w.mistake}</p><p>復習ポイント：{w.point}</p>{w.questionIds.map(id => <p key={id}>対応問題：{data.questions.find(q => q.id === id)?.prompt ?? "未登録・確認待ち"}</p>)}</article>)}</div>
      <ReviewTargetPlan plan={plan} expired={!!plan && !activePlan} onImport={async (raw, kind) => { if (!active() || pending.current) return; pending.current = true; setBusy(true); try { await planState.importFile(raw, kind, Date.now()); if (active()) setError(""); } finally { pending.current = false; if (active()) setBusy(false); } }} onClear={() => { if (active()) { planState.clear(); setError(""); } }} onError={setError} disabled={busy || loading || planState.restoring} />
      <div className="space-y-2 rounded-2xl bg-white p-4"><h3 className="font-bold">間違い直し</h3><p className="text-sm">{wrong.length ? `${wrong.length}問を確認中。期限と対策範囲に合う日に取り組もう。` : "今は間違い直しの候補はありません。"}</p>{wrong.map(q => <p key={q.id} className="text-sm">{q.unit}：{q.prompt}</p>)}{wrong.length > 0 && <button disabled={!!error || busy || !candidates.some(c => wrong.some(q => q.id === c.question.id))} className={secondary} onClick={() => beginDaily(true)}>間違い直しを始める</button>}</div>
      <details className="rounded-2xl bg-white p-4"><summary className="cursor-pointer font-bold">復習問題一覧（{data.questions.length}問）</summary>{data.questions.map(q => <article key={q.id} className="my-3 space-y-1 border-b border-slate-100 pb-2 text-sm"><p className="font-bold">{SUBJECTS[q.subject]}／{q.unit}：{q.prompt}</p><p>{progressLabel(data.progress.find(p => p.questionId === q.id && p.questionVersion === q.version))}{(() => { const p = data.progress.find(p => p.questionId === q.id && p.questionVersion === q.version); return p ? " ／ 次の確認 " + getJstDay(reviewDueAt(p)) + "（JST）" : ""; })()}</p></article>)}</details>
      <details className="rounded-2xl bg-white p-4"><summary className="cursor-pointer font-bold">回答履歴・改善記録（最近50回答）</summary>{data.history.map(a => <p key={a.id} className="my-2 text-sm">{new Date(a.answeredAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} · {a.prompt}：{a.correct ? "正解" : "誤答"} ／ {time(a.elapsedMs)} ／ {a.mode === "retry" ? "直後の再挑戦" : "再確認"}</p>)}</details>
      {sample && !error && <ReviewManager questions={data.questions} weaknesses={data.weaknesses} onQuestions={registerQuestions} onWeakness={registerWeakness} busy={busy} />}
    </>}
  </section>;
}
