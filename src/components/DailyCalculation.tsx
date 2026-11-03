import { useEffect, useMemo, useRef, useState } from "react";
import { getDocs, limit, onSnapshot, orderBy, query, where, type Firestore } from "firebase/firestore";
import { calculationStorageKey, commitCalculationAttempt, formatCalculationTime, getCalculationAttempts, getCalculationDays, getCalculationElapsedSeconds, getJstDateKey, MAX_CALCULATION_SECONDS, type CalculationAttempt, type CalculationDay, type CalculationDraft } from "../daily-calculation";
import { calculationDateTrend, calculationTaskRecords, calculationStartLabel, type CalculationScoreMode } from "../daily-calculation-view";
import { calculationDiagnosticSource, diagnosticReasonText, normalizeDiagnosticError, recordDiagnostic, scopedDiagnosticRecorder, type DiagnosticCode } from "../device-test";
import { DiagnosticButton } from "./DiagnosticButton";
import { useTimerDiagnostics } from "../use-timer-diagnostics";

type ActiveCalculation = { id: string; dateKey: string; startedAt: number; elapsedSeconds: number; phase: "running" | "paused" | "scoring"; score: number; finishedAt?: number };
const readActive = (familyId: string, uid: string, taskId: string): ActiveCalculation | null => {
  try {
    const pointer = localStorage.getItem(`calculation-active-${familyId}-${uid}-${taskId}`);
    if (!pointer) return null;
    const saved = JSON.parse(localStorage.getItem(`${calculationStorageKey(familyId, uid, pointer)}-${taskId}`) || "null") as ActiveCalculation | null;
    if (!saved || typeof saved.id !== "string" || !saved.id || !Number.isFinite(saved.startedAt) || saved.startedAt < 0 || !Number.isInteger(saved.score) || saved.score < 0 || saved.score > 7 || saved.dateKey !== pointer || getJstDateKey(saved.startedAt) !== pointer || !Number.isInteger(saved.elapsedSeconds) || saved.elapsedSeconds < 0 || saved.elapsedSeconds > MAX_CALCULATION_SECONDS || !["running", "paused", "scoring"].includes(saved.phase) || (saved.phase === "scoring" && (saved.finishedAt === undefined || !Number.isFinite(saved.finishedAt) || saved.finishedAt < saved.startedAt))) return null;
    return { ...saved, phase: saved.phase === "running" ? "paused" : saved.phase };
  } catch { return null; }
};

const CalculationStopwatch = ({ familyId, uid, sample, onSave, diagnostic, startLabel, taskId, taskLabel, blocked, blockedReason = "OTHER_TIMER", onRunningChange }: { onRunningChange: (running: boolean) => void; taskId: string; taskLabel: string; blocked: boolean; blockedReason?: DiagnosticCode; familyId: string; uid: string; sample: boolean; onSave: (draft: CalculationDraft) => Promise<CalculationAttempt>; diagnostic: boolean; startLabel: string }) => {
  const [active, setActive] = useState<ActiveCalculation | null>(() => sample ? null : readActive(familyId, uid, taskId));
  const [elapsed, setElapsed] = useState(active?.elapsedSeconds ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const anchor = useRef({ elapsed: active?.elapsedSeconds ?? 0, at: 0 });
  const busy = useRef(false);
  const current = useRef(active);
  const mounted = useRef(true);
  const source = calculationDiagnosticSource(taskLabel);
  const transition = useTimerDiagnostics(source, saving ? "saving" : saved ? "saved" : error && active?.phase === "scoring" ? "retryable" : active?.phase === "scoring" ? "review_pending" : active?.phase ?? "idle");
  const saveLocal = (value: ActiveCalculation | null) => {
    if (sample) return;
    try {
      const pointer = `calculation-active-${familyId}-${uid}-${taskId}`;
      if (value) { localStorage.setItem(`${calculationStorageKey(familyId, uid, value.dateKey)}-${taskId}`, JSON.stringify(value)); localStorage.setItem(pointer, value.dateKey); }
      else {
        const date = localStorage.getItem(pointer);
        if (date) {
          const key = `${calculationStorageKey(familyId, uid, date)}-${taskId}`;
          // A delayed save from a closed modal must not clear a newer draft.
          if (JSON.parse(localStorage.getItem(key) || "null")?.id !== current.current?.id) return;
          localStorage.removeItem(key);
        }
        localStorage.removeItem(pointer);
      }
    } catch { setError("この端末に途中の記録を残せなかったよ。画面を閉じる前に保存してね。"); }
  };
  const change = (value: ActiveCalculation | null) => { saveLocal(value); current.current = value; setActive(value); if (mounted.current) onRunningChange(value?.phase === "running"); };
  useEffect(() => {
    mounted.current = true;
    const tick = () => {
      const value = current.current;
      if (value?.phase !== "running") return;
      const seconds = getCalculationElapsedSeconds(anchor.current.elapsed, anchor.current.at, performance.now());
      setElapsed(seconds);
      if (!sample) {
        try { localStorage.setItem(`${calculationStorageKey(familyId, uid, value.dateKey)}-${taskId}`, JSON.stringify({ ...value, elapsedSeconds: seconds })); } catch { /* Save remains available. */ }
      }
    };
    const timer = window.setInterval(tick, 250);
    window.addEventListener("pagehide", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { tick(); mounted.current = false; onRunningChange(false); window.clearInterval(timer); window.removeEventListener("pagehide", tick); document.removeEventListener("visibilitychange", tick); };
  }, [familyId, uid, sample, taskId, onRunningChange]);
  const start = () => {
    if (blocked || busy.current || (current.current && current.current.phase !== "paused")) { recordDiagnostic({ type: "GUARD", source, button: "START", code: blocked ? blockedReason : busy.current ? "BUSY" : "WRONG_PHASE" }); return; }
    recordDiagnostic({ type: "HANDLER", source, button: active?.phase === "paused" ? "RESUME" : "START" });
    const now = Date.now();
    const value: ActiveCalculation = active?.phase === "paused" ? { ...active, phase: "running" } : { id: crypto.randomUUID(), dateKey: getJstDateKey(now), startedAt: now, elapsedSeconds: 0, score: 0, phase: "running" };
    anchor.current = { elapsed: value.elapsedSeconds, at: performance.now() };
    setElapsed(value.elapsedSeconds); change(value); setError(""); setSaved(false);
  };
  const finish = () => {
    if (!active || current.current?.phase !== "running") { recordDiagnostic({ type: "GUARD", source, button: "STOP", code: "WRONG_PHASE" }); return; }
    recordDiagnostic({ type: "HANDLER", source, button: "STOP" }); transition("stopping");
    const seconds = getCalculationElapsedSeconds(anchor.current.elapsed, anchor.current.at, performance.now());
    setElapsed(seconds);
    change({ ...active, elapsedSeconds: seconds, finishedAt: Math.max(active.startedAt, Date.now()), phase: "scoring" });
  };
  const save = async () => {
    const log = scopedDiagnosticRecorder();
    if (!active || active.phase !== "scoring" || busy.current) { recordDiagnostic({ type: "GUARD", source, button: "SAVE", code: busy.current ? "BUSY" : "WRONG_PHASE" }); return; }
    recordDiagnostic({ type: "HANDLER", source, button: "SAVE" }); transition("saving");
    recordDiagnostic({ type: "SAVE_START", source });
    busy.current = true; setSaving(true); setError("");
    try { await onSave({ id: active.id, dateKey: active.dateKey, score: active.score, elapsedSeconds: active.elapsedSeconds, startedAt: active.startedAt, finishedAt: active.finishedAt!, taskId, taskLabel }); log({ type: "SAVE_SUCCESS", source }); transition("saved", log); change(null); setSaved(true); }
    catch (error) { log({ type: "SAVE_FAILURE", source, code: normalizeDiagnosticError(error), retry: true }); transition("failed", log); transition("retryable", log); setError("保存できなかったよ。記録は残っているので、もう一度保存してね。"); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section className="rounded-3xl bg-white p-5 shadow-sm">
    <h2 className="text-xl font-black">計算の結果を記録</h2><p className="mt-2 text-sm">計算時間は学習時間・活動Pには重ねて加えないよ。画面を閉じると計測はお休みするよ。</p>{blocked && <p role="status" className="mt-2">先に学習タイマーを終了して、途中の学習記録を保存してね。</p>}
    <p role="status" className="mt-3 text-center font-bold">{saving ? "結果を保存中…" : error ? "記録を確認して、もう一度ためしてね。" : saved ? "結果を保存したよ！" : active?.phase === "running" ? "計測中" : active?.phase === "scoring" ? "計測終了。得点を選んで結果を確認してね。" : active?.phase === "paused" ? "計測をお休み中" : "準備ができたら計算をはじめよう"}</p>
    <p className="my-4 text-center font-mono text-4xl font-black" aria-live="off">{formatCalculationTime(elapsed)}</p>
    {!active && <DiagnosticButton source={source} action="START" reason={blocked ? blockedReason : "NONE"} className="w-full rounded-2xl bg-blue-600 p-5 text-xl font-black text-white" disabled={blocked} onClick={start}>{startLabel}</DiagnosticButton>}
    {active?.phase === "paused" && <><p className="mb-3">画面を開き直したので、計測をお休みしているよ。続きから再開してね。</p><DiagnosticButton source={source} action="RESUME" reason={blocked ? blockedReason : "NONE"} className="w-full rounded-2xl bg-blue-600 p-4 font-bold text-white" disabled={blocked} onClick={start}>計測を再開</DiagnosticButton></>}
    {active?.phase === "running" && <DiagnosticButton source={source} action="STOP" reason="NONE" className="w-full rounded-2xl bg-emerald-600 p-5 text-xl font-black text-white" onClick={finish}>計算を終了して結果を記録</DiagnosticButton>}
    {active?.phase === "scoring" && <div className="space-y-4"><p className="text-lg font-bold">得点 {active.score}/7 ・ 所要時間 {formatCalculationTime(active.elapsedSeconds)}</p><div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }, (_, score) => <button key={score} aria-pressed={active.score === score} disabled={saving} className={`rounded-xl p-3 text-xl font-black ${active.score === score ? "bg-blue-600 text-white" : "bg-slate-100"}`} onClick={() => change({ ...active, score })}>{score}</button>)}</div><DiagnosticButton source={source} action="SAVE" reason={saving ? "SAVING" : "NONE"} disabled={saving} className="w-full rounded-2xl bg-blue-600 p-4 font-bold text-white disabled:opacity-50" onClick={() => void save()}>{saving ? "保存中…" : "この結果を保存"}</DiagnosticButton></div>}
    {active && <p className="mt-3 text-sm">記録する日：{active.dateKey}（始めた日）</p>}
    {error && <p className="mt-3" role="alert">{error}</p>}
    {blocked && <p role="status" className="mt-2 text-sm">{diagnosticReasonText(blockedReason)}</p>}
    {diagnostic && <p className="mt-3 text-xs">端末診断に計算の状態コードを記録しています。</p>}
  </section>;
};

type CalculationProps = { db: Firestore | null; familyId: string; uid: string; sample: boolean; sampleAttempts: CalculationAttempt[] };

export const CalculationInput = ({ db, familyId, uid, sample, sampleAttempts, onSampleSave, diagnostic, taskId, taskLabel, blocked, blockedReason, onRunningChange }: CalculationProps & { onRunningChange: (running: boolean) => void; onSampleSave: (attempt: CalculationAttempt) => void; diagnostic: boolean; taskId: string; taskLabel: string; blocked: boolean; blockedReason?: DiagnosticCode }) => {
  const [attempts, setAttempts] = useState<CalculationAttempt[]>([]);
  const [today, setToday] = useState(getJstDateKey);
  const [loading, setLoading] = useState(!sample);
  const [error, setError] = useState("");
  useEffect(() => { const timer = window.setInterval(() => setToday(getJstDateKey()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!db || sample) return;
    const log = scopedDiagnosticRecorder();
    recordDiagnostic({ type: "READ_START", source: "calculation" });
    return onSnapshot(query(getCalculationAttempts(db, familyId, uid, today), orderBy("attemptNo")), snapshot => {
      setAttempts(snapshot.docs.map(item => item.data() as CalculationAttempt)); setLoading(false); setError("");
      log({ type: "READ_SUCCESS", source: "calculation", code: "READ_ALLOWED" });
    }, (error) => { log({ type: "READ_FAILURE", source: "calculation", code: normalizeDiagnosticError(error) }); setLoading(false); setError("記録を読み込めなかったよ。保存済みの記録を確認するため、画面を開き直してね。"); });
  }, [db, familyId, uid, sample, today]);
  const record = calculationTaskRecords(sample ? sampleAttempts : attempts).find(item => item.taskId === taskId && item.dateKey === today);
  const save = async (draft: CalculationDraft) => {
    if (!sample) {
      if (!db) throw new Error("接続を確認してね。");
      return commitCalculationAttempt(db, familyId, uid, draft);
    }
    const existing = sampleAttempts.find(item => item.id === draft.id);
    if (existing) return existing;
    const attemptNo = Math.max(0, ...sampleAttempts.filter(item => item.dateKey === draft.dateKey).map(item => item.attemptNo)) + 1;
    const attempt: CalculationAttempt = { ...draft, attemptNo, maxScore: 7, attemptType: attemptNo === 1 ? "first" : "redo", createdAt: Date.now() };
    onSampleSave(attempt); return attempt;
  };
  return <div className="space-y-3">
    {loading && <p role="status">記録を読み込み中…</p>}{error && <p role="alert">{error}</p>}
    {/* History loading does not control the local timer; saving uses a transaction. */}
    <CalculationStopwatch familyId={familyId} uid={uid} sample={sample} onSave={save} diagnostic={diagnostic} taskId={taskId} taskLabel={taskLabel} onRunningChange={onRunningChange} blocked={blocked} blockedReason={blockedReason} startLabel={calculationStartLabel(record)} />
    {record && <p className="font-bold">今日の最新 {record.latestScore}/7 ・ {formatCalculationTime(record.latestElapsedSeconds)} / 解き直し{record.attemptCount - 1}回 / {record.bestScore === 7 ? "7/7達成" : "チャレンジ中"}</p>}
    <p className="text-sm">保存した結果とグラフは「実績 → 計算の記録」で見られるよ。7/7になった後も何度でも挑戦できるよ。</p>
  </div>;
};

// A single saved day cannot show a trend. Use a compact fact card for one day,
// then labeled, proportional comparison bars for multiple real saved records.
const CalculationGraph = ({ data, valueKey, title, score }: {
  data: { label: string; score: number; elapsedSeconds: number }[];
  valueKey: "score" | "elapsedSeconds"; title: string; score: boolean;
}) => {
  const [showAll, setShowAll] = useState(false);
  const entries = showAll ? data : data.slice(-7);
  const last = data.at(-1);
  const first = data[0];
  const limit = score ? 7 : Math.max(1, ...data.map(item => item.elapsedSeconds));
  const valueText = (value: number) => score ? `${value}/7 点` : formatCalculationTime(value);
  const formatLabel = (label: string) => /^\\d{4}-\\d{2}-\\d{2}$/.test(label) ? label.slice(5).replace("-", "/") : label;
  const change = first && last ? last[valueKey] - first[valueKey] : 0;
  return (
    <section className="design20-series" aria-label={title}>
      <div className="design20-series-header">
        <h3>{title}</h3>
        <span className="design20-series-unit">{score ? "7点満点" : "単位：分・秒"}</span>
      </div>
      {data.length === 0 ? (
        <p className="design20-series-empty">この課題の記録はまだありません。</p>
      ) : data.length === 1 && last ? (
        <div className="design20-series-single" role="status">
          <div>
            <span className="design20-series-small">記録された結果</span>
            <strong>{valueText(last[valueKey])}</strong>
            <span className="design20-series-date">{last.label}</span>
          </div>
          <p>記録はまだ1回分。<b>別の日の記録が増えると比較できます。</b> 現時点では上がった・下がったとは判定しません。</p>
        </div>
      ) : (
        <>
          <div className="design20-series-overview">
            <span>最初 <strong>{valueText(first[valueKey])}</strong></span>
            <span>最新 <strong>{valueText(last![valueKey])}</strong></span>
            <span className="design20-series-delta">差 {change > 0 ? "+" : ""}{score ? `${change}点` : `${change}秒`}</span>
          </div>
          <div className="design20-series-bars" role="list">
            {entries.map((entry, index) => {
              const v = entry[valueKey];
              return (
                <div className="design20-series-row" role="listitem" key={`${entry.label}-${index}`}>
                  <span className="design20-series-label" title={entry.label}>{formatLabel(entry.label)}</span>
                  <div className="design20-series-track" role="img" aria-label={`${entry.label}：${valueText(v)}`}>
                    <div className={`design20-series-fill ${score ? "design20-series-score" : "design20-series-time"}`} style={{ width: `${Math.max(0, Math.min(100, v / limit * 100))}%` }} />
                  </div>
                  <strong className="design20-series-value">{valueText(v)}</strong>
                </div>
              );
            })}
          </div>
          {data.length > 7 && (
            <button type="button" className="design20-series-toggle" aria-expanded={showAll} onClick={() => setShowAll(current => !current)}>
              {showAll ? "最新7件に戻す" : `全${data.length}件を見る（表示中：最新7件）`}
            </button>
          )}
          <p className="design20-series-footnote">{score ? "棒の長さは7点を基準に比較しています。" : "棒の長さは表示中の記録の最大所要時間を基準にしています。"} 日付のない日は追加していません。</p>
        </>
      )}
    </section>
  );
};

// Reset records and selections at the identity boundary, including pending reads.
export const DailyCalculation = (props: CalculationProps) => <CalculationRecords key={JSON.stringify([props.familyId, props.uid, props.sample])} {...props} />;

const CalculationRecords = ({ db, familyId, uid, sample, sampleAttempts }: CalculationProps) => {
  const [scoreMode, setScoreMode] = useState<CalculationScoreMode>("first");
  const [days, setDays] = useState<CalculationDay[]>([]);
  const [olderDays, setOlderDays] = useState<CalculationDay[]>([]);
  const [byDate, setByDate] = useState<Record<string, CalculationAttempt[]>>({});
  const [selectedDate, setSelectedDate] = useState(getJstDateKey);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [loading, setLoading] = useState(!sample);
  const [error, setError] = useState("");
  const [moreBusy, setMoreBusy] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const detailRef = useRef<HTMLElement>(null);
  const requestedDetailDate = useRef<string | null>(null);
  useEffect(() => {
    if (!db || sample) return;
    return onSnapshot(query(getCalculationDays(db, familyId, uid), orderBy("dateKey", "desc"), limit(30)), snapshot => {
      setDays(snapshot.docs.map(item => item.data() as CalculationDay)); setLoading(false); setError("");
    }, () => { setLoading(false); setError("記録を読み込めなかったよ。画面を開き直してね。"); });
  }, [db, familyId, uid, sample]);
  const dates = [...new Set([...days, ...olderDays].map(day => day.dateKey))].sort().join(",");
  useEffect(() => {
    if (!db || sample || !dates) return;
    const stops = dates.split(",").map(dateKey => onSnapshot(query(getCalculationAttempts(db, familyId, uid, dateKey), orderBy("attemptNo")), snapshot => {
      setByDate(current => ({ ...current, [dateKey]: snapshot.docs.map(item => item.data() as CalculationAttempt) }));
    }, () => setError("この日の記録を読み込めなかったよ。画面を開き直してね。")));
    return () => stops.forEach(stop => stop());
  }, [db, familyId, uid, sample, dates]);
  const records = useMemo(() => calculationTaskRecords(sample ? sampleAttempts : Object.values(byDate).flat()), [sample, sampleAttempts, byDate]);
  const taskOptions = [...new Map(records.map(item => [item.taskId, item.taskLabel])).entries()];
  const taskId = selectedTask !== null && taskOptions.some(([id]) => id === selectedTask) ? selectedTask : taskOptions[0]?.[0] ?? "";
  const trend = calculationDateTrend(sample ? sampleAttempts : Object.values(byDate).flat(), taskId, scoreMode);
  const trendLoading = !sample && (loading || dates.split(",").filter(Boolean).some(date => !(date in byDate)));
  const scoreLabel = scoreMode === "latest" ? "最新" : scoreMode === "best" ? "最高" : "初回";
  const selected = records.find(item => item.dateKey === selectedDate && item.taskId === taskId);
  const history = selected?.history ?? [];
  const dayRecords = records.filter(item => item.dateKey === selectedDate);
  const detailLoading = !sample && dates.split(",").includes(selectedDate) && !(selectedDate in byDate);
  useEffect(() => {
    if (detailLoading || requestedDetailDate.current !== selectedDate) return;
    requestedDetailDate.current = null;
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [selectedDate, detailLoading]);
  const selectDay = (dateKey: string, id: string) => {
    setSelectedTask(id);
    requestedDetailDate.current = dateKey;
    if (dateKey !== selectedDate) setSelectedDate(dateKey);
    else if (!detailLoading) { requestedDetailDate.current = null; requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  };
  const more = async () => {
    if (!db || moreBusy || !dates) return;
    setMoreBusy(true);
    try {
      const oldest = dates.split(",")[0];
      const snapshot = await getDocs(query(getCalculationDays(db, familyId, uid), where("dateKey", "<", oldest), orderBy("dateKey", "desc"), limit(30)));
      setOlderDays(current => [...current, ...snapshot.docs.map(item => item.data() as CalculationDay)]); setHasMore(snapshot.size === 30);
    } catch { setError("前の記録を読み込めなかったよ。もう一度ためしてね。"); }
    finally { setMoreBusy(false); }
  };
  return <section className="design20-calculation mx-auto w-full max-w-5xl min-w-0" aria-label="計算の記録">
    <div className="design20-calculation-heading">
      <div><span className="design20-calculation-eyebrow">DAILY CALCULATION</span><h2>毎日計算の記録</h2></div>
      <p>同じ課題を日付ごとに比較します。7点満点、記録のない日は0点にはしません。</p>
    </div>
    {loading && <p role="status">記録を読み込み中…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !records.length && <p>まだ記録がないよ。「学習 → 算数 → 計算」のカードから結果を保存してね。</p>}
    <div className="design20-calculation-filters">
      <label>比較する課題<select aria-label="グラフで見る計算課題" value={taskId} onChange={event => setSelectedTask(event.target.value)}>{taskOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>表示する得点<select aria-label="日付ごとに表示する得点" value={scoreMode} onChange={event => setScoreMode(event.target.value as CalculationScoreMode)}><option value="first">初回</option><option value="latest">最新</option><option value="best">最高</option></select></label>
    </div>
    <p className="design20-calculation-status" role="status">{trendLoading ? "日付別の記録を読み込み中…" : trend.length === 1 ? "1日分の記録です。推移を判断するには別の日の記録が必要です。" : `比較できる記録：${trend.length}日分（JST）`}</p>
    <div className="design20-calculation-charts">
      <CalculationGraph data={trend} valueKey="score" title={`日付別・${scoreLabel}得点`} score />
      <CalculationGraph data={trend} valueKey="elapsedSeconds" title="日付別・初回所要時間" score={false} />
    </div>
    <section className="design20-calculation-log"><h3>日ごとの記録</h3><p>選択中の課題を日付順に確認できます。</p><div className="design20-calculation-log-list">{records.filter(record => record.taskId === taskId).map(record => <button key={JSON.stringify([record.dateKey, record.taskId])} className={"w-full rounded-xl border p-3 text-left " + (selectedDate === record.dateKey && taskId === record.taskId ? "border-blue-500 bg-blue-50" : "border-slate-100")} onClick={() => selectDay(record.dateKey, record.taskId)}><strong>{record.dateKey} / {record.taskLabel}</strong><p>初回 {record.firstScore}/7 ・ {formatCalculationTime(record.firstElapsedSeconds)}</p><p>最新 {record.latestScore}/7 ・ {formatCalculationTime(record.latestElapsedSeconds)}</p><p className="text-sm">最高 {record.bestScore}/7 / 解き直し{record.attemptCount - 1}回 / {record.bestScore === 7 ? "7/7達成" : "チャレンジ中"}</p></button>)}</div>{!sample && hasMore && dates.split(",").length >= 30 && <button className="mt-3 w-full rounded-xl bg-slate-100 p-3 font-bold" disabled={moreBusy} onClick={() => void more()}>{moreBusy ? "読み込み中…" : "もっと前の日を見る"}</button>}</section>
    <section ref={detailRef} className="design20-calculation-detail scroll-mt-4">
      <h3 className="font-black">{selectedDate} / {taskOptions.find(([id]) => id === taskId)?.[1] ?? "課題未指定"} / この日の解き直し</h3>
      <p className="text-sm text-slate-600">解き直しで解く問題数が違う場合、時間だけでは比べられないよ。短い時間でも得点が下がったときは、改善したとはいえないよ。</p>
      {detailLoading ? <p role="status">読み込み中…</p> : <><div className="design20-calculation-charts"><CalculationGraph data={history} valueKey="score" title="この日の各回の得点" score /><CalculationGraph data={history} valueKey="elapsedSeconds" title="この日の各回の所要時間" score={false} /></div>
      <h4 className="font-bold">この日の全課題・全記録</h4>{dayRecords.length ? dayRecords.map(record => <div key={record.taskId}><h5 className="font-bold">{record.taskLabel}</h5><ol className="mt-3 space-y-2">{record.history.map(attempt => <li key={attempt.id} className="rounded-xl bg-slate-50 p-3"><p className="font-bold">{attempt.label}</p><p>{attempt.score}/7 ・ {formatCalculationTime(attempt.elapsedSeconds)}</p></li>)}</ol></div>) : <p>この日の記録はまだないよ。</p>}</>}
    </section>
  </section>;
};
