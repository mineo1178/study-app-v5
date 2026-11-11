import { usePracticeSelection } from "../review/use-practice-selection";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { FamilySession } from "../use-family-session";
import { SUBJECTS, createReviewDraft, visibleQuestions, answerQuestion, getJstDay, nextProgress, progressLabel, restoreDraft, sampleQuestions, reviewDueAt, type Draft, type Question, type Weakness } from "../review/model";
import { dailyReviewSelection, nextReviewTarget, type RegisteredTest } from "../review/target-plan";
import { useReviewPlan } from "../review/use-review-plan";
import { ReviewTargetPlan } from "./ReviewTargetPlan";
import { loadReview, saveReview, type ReviewData } from "../review/repository";
import { ReviewManager } from "./ReviewManager";

const empty: ReviewData = { questions: [], weaknesses: [], progress: [], history: [] };
const primary = "rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-40";
const secondary = "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold disabled:opacity-40";
function readLocal(key: string) { try { return { raw: localStorage.getItem(key), error: "" }; } catch { return { raw: null, error: "この端末に途中経過を保存できません。再読込前に結果を保存してください。" }; } }

export function TestReview({ db, familyId, uid, sample, session, enabled, tests = [] }: { db: Firestore | null; familyId: string; uid: string; sample: boolean; session?: FamilySession; enabled: boolean; tests?: RegisteredTest[] }) {
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
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", refresh); };
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
    if (!questions.length || pending.current || !active() || planState.error || planState.restoring || loading || error || busy || (draft && draft.finishedAt === null)) return;
    const started = createReviewDraft(uid, questions, mode);
    // Refresh a stale day first so the user sees the new selection before starting.
    if ((mode === "daily" || mode === "practice") && getJstDay(started.startedAt) !== getJstDay(now)) { setNow(started.startedAt); return; }
    const next = started; setNow(next.startedAt); setSaved(false); setSelected(null); setDiscard(false); setError("");
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
        for (const a of fresh.filter(a => a.mode !== "practice")) all.set(a.questionId, nextProgress(all.get(a.questionId), a));
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
  const todayCount = data.history.filter(a => a.mode !== "practice" && getJstDay(a.answeredAt) === getJstDay(now)).length;
  const availableQuestions = useMemo(() => visibleQuestions(data.questions, sample), [data.questions, sample]);
  const wrong = availableQuestions.filter(q => data.progress.some(p => p.questionId === q.id && p.questionVersion === q.version && !p.latestCorrect));
  const { target, activePlan, status, hasRegisteredTarget } = nextReviewTarget(tests, plan, now);
  const { selected: candidates, eligibleCount, scopeCount, remaining, notDueCount, answeredInScope, answeredCount, newCount, topicLimited } =
    dailyReviewSelection(availableQuestions, data.progress, activePlan, now);
  const practiceState = usePracticeSelection(`study-review-v1:${scope}:practice-selection`, availableQuestions, data.history, activePlan, now, !loading && !planState.restoring);
  const practice = practiceState.questions;
  const missing = activePlan ? activePlan.items.length - scopeCount : 0;
  function beginDaily(wrongOnly = false) {
    begin(candidates.filter(c => !wrongOnly || wrong.some(q => q.id === c.question.id)).map(c => c.question), "daily");
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
        <p role="status" className="text-sm">開始日：{getJstDay(draft.startedAt)}（JST）。途中の問題を続けています。日付や計画が変わっても、この問題は入れ替えません。</p>
        <p className="text-sm font-bold">{draft.answers.length + 1} / {draft.questions.length} 問 · {time(Math.max(0, now - draft.startedAt))}</p>
        <p className="text-xs text-slate-500">目安は3分。時間を超えても大丈夫。焦らず考えよう。途中経過はこの端末に保存します。</p>
        <p className="text-sm">{SUBJECTS[draft.questions[draft.answers.length].subject]} ／ {draft.questions[draft.answers.length].unit}</p>
        <p className="rounded-xl bg-blue-50 p-3 text-sm">選んだ理由：{nextReviewTarget(tests, plan, draft.startedAt).activePlan?.items.find(i => i.questionId === draft.questions[draft.answers.length].id && i.questionVersion === draft.questions[draft.answers.length].version)?.reason ?? "日を空けて、自分で思い出せるか確かめよう。"}</p>
        <h3 className="whitespace-pre-wrap text-lg font-bold">{draft.questions[draft.answers.length].prompt}</h3>
        <div role="group" aria-label="解答候補" className="space-y-2">{draft.questions[draft.answers.length].choices.map((choice, index) => <button key={index} aria-pressed={selected === index} className={`block w-full break-words rounded-xl border-2 p-3 text-left ${selected === index ? "border-blue-600 bg-blue-50" : "border-slate-200"}`} onClick={() => setSelected(index)}>{index + 1}. {choice}</button>)}</div>
        <button className={primary} disabled={selected === null} onClick={() => { if (selected === null) return; const next = answerQuestion(draft, selected, Date.now()); setSelected(null); setNow(Date.now()); persistDraft(next); }}>{draft.answers.length + 1 === draft.questions.length ? "最後の回答を決めて採点" : "回答を決めて次へ"}</button>
      </div> : <div className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4">
        <h3 className="text-xl font-black text-emerald-700">{draft.answers.filter(a => a.correct).length} / {draft.questions.length} 問 正解</h3>
        <p>{time(draft.finishedAt - draft.startedAt)}取り組めたね！ 確認したことを、また思い出してみよう。</p>
        {draft.mode === "practice" && <p className="font-bold">追加練習です。復習段階・次回復習日は変更しません。</p>}
        {draft.mode === "retry" && <p className="text-sm text-slate-600">解説を見たあとの再挑戦です。日を空けて解けるかも確認しよう。</p>}
        {draft.answers.map(a => { const previous = data.history.find(h => h.questionId === a.questionId && h.id !== a.id && h.answeredAt < a.answeredAt); return <article key={a.id} className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-bold">{a.correct ? "○ 正解" : "もう一度確認"}：{a.prompt}</p><p>あなたの回答：{a.selected}</p><p>正解：{a.expected}</p><p className="whitespace-pre-wrap">{a.explanation}</p>{saved && (() => { const p = data.progress.find(p => p.questionId === a.questionId && p.questionVersion === a.questionVersion); return p ? <p className="font-bold">次の復習：{getJstDay(reviewDueAt(p))}（JST）</p> : null; })()}
          {previous && <p>前回：{previous.correct ? "正解" : "誤答"} → 今回：{a.correct ? "正解" : "誤答"}（{draft.mode === "retry" ? "直後の再挑戦" : "再確認"}）</p>}
        </article>; })}
        {!saved ? <button className={primary} disabled={busy} onClick={() => { void storeResult(); }}>{busy ? "保存中…" : "結果を保存する（失敗時は再試行）"}</button> : <>
          <p role="status" className="font-bold text-emerald-700">保存しました</p>
          {draft.answers.some(a => !a.correct) && <button className={primary} onClick={() => begin(draft.questions.filter((_, i) => !draft.answers[i].correct), draft.mode === "practice" ? "practice" : "retry")}>間違えた問題をもう一度</button>}
          <button className={`${secondary} ml-2 mt-2`} onClick={() => { persistDraft(null); setSaved(false); setDiscard(false); }}>復習ホームへ</button>
        </>}
      </div>}
      {!saved && <div className="space-y-2 text-sm"><button disabled={busy} className={secondary} onClick={() => setDiscard(!discard)}>今回はここで終わる</button>{discard && <div className="space-y-2"><p>端末の途中経過を削除します。保存済みの回答は残ります。</p><button disabled={busy} className={secondary} onClick={() => { persistDraft(null); setDiscard(false); setError(""); }}>未保存の回答を破棄してホームへ</button></div>}</div>}
    </> : <>
      <div className="space-y-3 rounded-2xl border border-blue-100 bg-white p-4">
        <h3 className="text-lg font-black">今日の復習：{candidates.length}問</h3><p className="text-sm text-slate-600">最大5問。復習期限が来た問題を先に、次にテストとの関連と確認の優先度で選ぶよ。期限前の問題で数を埋めません。</p>
        <details className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-bold">計画・出題診断</summary>
          <p className="font-bold">{activePlan ? "テスト対策" : "一般復習"}</p>
          <p>現在の対策：{target?.label ?? "次回カリテ未登録"} ／ 開催日：{target?.testDay ?? "未登録"}</p>
          <p>対策計画：{status} ／ 今日の候補：{eligibleCount}問</p>
          <p>公開済み：{availableQuestions.length}問 ／ {activePlan ? "計画に対応" : "一般復習の対象"}：{scopeCount}問 ／ 今日の出題：{candidates.length}問</p>
          <details aria-label="出題診断"><summary>出題診断（この端末の読込時点）</summary>
            <p>計画とID・版が一致：{plan ? availableQuestions.filter(q => plan.items.some(i => i.questionId === q.id && i.questionVersion === q.version)).length : 0}問</p>
            <p>公開問題の未出題：{availableQuestions.filter(q => !data.progress.some(p => p.questionId === q.id && p.questionVersion === q.version)).length}問 ／ 出題済み：{availableQuestions.filter(q => data.progress.some(p => p.questionId === q.id && p.questionVersion === q.version)).length}問</p>
            <p>当日回答済み：{answeredCount}問 ／ 対象内の期限到来：{eligibleCount - newCount}問 ／ 最終候補：{candidates.length}問</p>
            <p>対策計画はこの端末に保存されます。別端末では状態が異なる場合があります。開始済みの問題は途中経過から復元します。</p>
          </details>
          {activePlan && !hasRegisteredTarget &&
            <p>登録済みの次回カリテ日程がないため、この端末の計画の日付を使います。</p>}
          {!activePlan && <p className="text-amber-900">
            {status === "期限切れ" ? `保存済み計画（${plan?.testDay}）の期限が過ぎました。`
              : status === "日程不一致" ? `保存済み計画（${plan?.label}／${plan?.testDay}）は次回カリテの名前または開催日と一致しません。`
                : "次回カリテの対策計画が未設定です。"}
            下の「この端末のテスト対策計画」から新しいJSONを取り込めます。
          </p>}
          {activePlan && (scopeCount < 5 || missing > 0 || activePlan.gaps.length > 0) && <p className="text-amber-900">
            対象問題の不足：対応済みは{scopeCount}問。{missing > 0 && `計画内の${missing}問は未公開・未登録、または問題の版が一致しません。`}{activePlan.gaps.length > 0 && `計画に記載された不足・未確認は${activePlan.gaps.length}件です。`}
          </p>}
          {candidates.length < 5 && <ul className="list-inside list-disc text-slate-600">
            {scopeCount < 5 && <li>{activePlan ? "計画に対応する問題" : "公開済みの登録問題"}が{5 - scopeCount}問不足しています。</li>}
            {notDueCount > 0 && <li>{notDueCount}問は復習期限前です。</li>}
            {answeredCount > 0 && <li>今日は{answeredCount}問に回答済みです（対象内{answeredInScope}問）。残り枠は{remaining}問です。</li>}
            {topicLimited && <li>計画の単元ごとの出題上限に達しました。</li>}
          </ul>}
          {eligibleCount > 0 && <p className="text-slate-600">
            期限到来：{eligibleCount - newCount}問 ／ 未出題：{newCount}問。
            {eligibleCount <= remaining ? "候補が残り枠以内の日は、同じ問題が並ぶことがあります。" : "期限到来・誤答履歴を優先するため、同じ問題が続くことがあります。同順位の候補はJSTの日付で順番が変わります。"}
          </p>}
        </details>
        <ReviewTargetPlan plan={plan} expired={status === "期限切れ"} onImport={async (raw, kind) => { if (!active() || pending.current) return; pending.current = true; setBusy(true); try { await planState.importFile(raw, kind, Date.now()); if (active()) setError(""); } finally { pending.current = false; if (active()) setBusy(false); } }} onClear={() => { if (active()) { planState.clear(); setError(""); } }} onError={setError} disabled={busy || loading || planState.restoring} />
        {candidates.map(c => <p key={c.question.id} className="rounded-xl bg-blue-50 p-2 text-sm">{SUBJECTS[c.question.subject]}／{c.question.unit}：{c.reason}（{c.dueAt === null ? "初めての確認" : getJstDay(c.dueAt) + "が復習期限"}{c.wrong && "・誤答履歴あり"}）</p>)}
        {!candidates.length && <p className="text-sm">今日は復習期限の問題がありません。無理に追加しなくて大丈夫。</p>}
        <button className={primary} disabled={!candidates.length || !!error || !!planState.error || planState.restoring || busy} onClick={() => beginDaily()}>今日の復習{candidates.length}問を始める</button>
        <p className="text-xs text-slate-600">間違えたら翌日。同じ日の再挑戦では段階を進めず、別の日に期限を迎えて正解したら3日・7日・14日へ。14日後も確認を続けます。元のテストの苦手を解消した判定ではありません。</p>
        <p className="text-sm" aria-label="今日の復習状況">今日の復習：{todayCount}回答（最近50回答の範囲・JST）／もう一度確認：{wrong.length}問</p>
        {!availableQuestions.length && <p className="text-sm">問題は準備中です。保護者に確認してください。</p>}
        {!sample && <button className={secondary} disabled={busy} onClick={() => { setLoading(true); setReload(n => n + 1); }}>復習データを再読込</button>}
      </div>
      <div className="space-y-3 rounded-2xl border border-violet-100 bg-white p-4">
        <h3 className="text-lg font-black">追加練習：{practice.length}問</h3>{practiceState.warning && <p role="alert">{practiceState.warning}</p>}
        <p className="text-sm">{activePlan ? "次回カリテの範囲を優先" : "一般練習"}。最大5問。期限前でも練習でき、復習段階・次回復習日は変わりません。</p>
        <p className="text-xs">前日までの最近50回答の出題回数・苦手を参考に選びます。</p>
        {!practice.length && <p>公開済みの登録問題がないため、追加練習できません。保護者に確認してください。</p>}
        <button className={primary} disabled={!practice.length || !!error || !!planState.error || busy} onClick={() => begin(practice, "practice")}>追加練習{practice.length}問を始める</button>
      </div>
      <div className="rounded-2xl bg-white p-4"><h3 className="mb-2 font-bold">苦手分野</h3><p className="mb-2 text-xs text-slate-500">保護者の入力です。教科の点数から単元の苦手を推測しません。小問の正解だけで元の弱点を解消済みにはしません。</p>{!data.weaknesses.length && <p className="text-sm">まだ登録されていません。</p>}{data.weaknesses.map(w => <article key={w.id} className="my-2 space-y-1 rounded-xl bg-slate-50 p-3 text-sm"><p className="font-bold">{SUBJECTS[w.subject]} ／ {w.unit}（{w.testKind}）</p><p>間違えた内容：{w.mistake}</p><p>復習ポイント：{w.point}</p>{w.questionIds.map(id => <p key={id}>対応問題：{data.questions.find(q => q.id === id)?.prompt ?? "未登録・確認待ち"}</p>)}</article>)}</div>
      <div className="space-y-2 rounded-2xl bg-white p-4"><h3 className="font-bold">間違い直し</h3><p className="text-sm">{wrong.length ? `${wrong.length}問を確認中。期限と対策範囲に合う日に取り組もう。` : "今は間違い直しの候補はありません。"}</p>{wrong.map(q => <p key={q.id} className="text-sm">{q.unit}：{q.prompt}</p>)}{wrong.length > 0 && <button disabled={!!error || busy || !candidates.some(c => wrong.some(q => q.id === c.question.id))} className={secondary} onClick={() => beginDaily(true)}>間違い直しを始める</button>}</div>
      <details className="rounded-2xl bg-white p-4"><summary className="cursor-pointer font-bold">復習問題一覧（{data.questions.length}問）</summary>{data.questions.map(q => <article key={q.id} className="my-3 space-y-1 border-b border-slate-100 pb-2 text-sm"><p className="font-bold">{SUBJECTS[q.subject]}／{q.unit}：{q.prompt}</p><p>{progressLabel(data.progress.find(p => p.questionId === q.id && p.questionVersion === q.version))}{(() => { const p = data.progress.find(p => p.questionId === q.id && p.questionVersion === q.version); return p ? " ／ 次の確認 " + getJstDay(reviewDueAt(p)) + "（JST）" : ""; })()}</p></article>)}</details>
      <details className="rounded-2xl bg-white p-4"><summary className="cursor-pointer font-bold">回答履歴・改善記録（最近50回答）</summary>{data.history.map(a => <p key={a.id} className="my-2 text-sm">{new Date(a.answeredAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} · {a.prompt}：{a.correct ? "正解" : "誤答"} ／ {time(a.elapsedMs)} ／ {a.mode === "practice" ? "追加練習" : a.mode === "retry" ? "直後の再挑戦" : "再確認"}</p>)}</details>
      {sample && !error && <ReviewManager questions={data.questions} weaknesses={data.weaknesses} onQuestions={registerQuestions} onWeakness={registerWeakness} busy={busy} />}
    </>}
  </section>;
}
