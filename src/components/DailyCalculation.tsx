import { loadCalculationHistory } from "../planning/calculation-history";
import { TargetTime } from "./TargetTime";
import { calculationEvidence, targetAverage } from "../planning/target-time";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { onSnapshot, orderBy, query, type Firestore } from "firebase/firestore";
import { calculationStorageKey, commitCalculationAttempt, formatCalculationTime, getCalculationAttempts, getCalculationDays, getCalculationElapsedSeconds, getJstDateKey, MAX_CALCULATION_SECONDS, type CalculationAttempt, type CalculationDay, type CalculationDraft } from "../daily-calculation";
import { calculationChartSeries, calculationGoalMet, type CalculationChartRange, calculationDateTrend, calculationTaskRecords, calculationStartLabel, type CalculationScoreMode } from "../daily-calculation-view";
import { calculationDiagnosticSource, diagnosticReasonText, normalizeDiagnosticError, recordDiagnostic, scopedDiagnosticRecorder, type DiagnosticCode } from "../device-test";
import { DiagnosticButton } from "./DiagnosticButton";
import { useTimerDiagnostics } from "../use-timer-diagnostics";

type ActiveCalculation = { measuredAt?: number; targetSeconds?: number; operationCheck?: boolean; id: string; dateKey: string; startedAt: number; elapsedSeconds: number; phase: "running" | "paused" | "scoring"; score: number; finishedAt?: number };
const readActive = (familyId: string, uid: string, taskId: string): ActiveCalculation | null => {
  try {
    const pointer = localStorage.getItem(`calculation-active-${familyId}-${uid}-${taskId}`);
    if (!pointer) return null;
    const saved = JSON.parse(localStorage.getItem(`${calculationStorageKey(familyId, uid, pointer)}-${taskId}`) || "null") as ActiveCalculation | null;
    if (!saved || typeof saved.id !== "string" || !saved.id || !Number.isFinite(saved.startedAt) || saved.startedAt < 0 || !Number.isInteger(saved.score) || saved.score < 0 || saved.score > 7 || saved.dateKey !== pointer || getJstDateKey(saved.startedAt) !== pointer || !Number.isInteger(saved.elapsedSeconds) || saved.elapsedSeconds < 0 || saved.elapsedSeconds > MAX_CALCULATION_SECONDS || !["running", "paused", "scoring"].includes(saved.phase) || (saved.phase === "scoring" && (saved.finishedAt === undefined || !Number.isFinite(saved.finishedAt) || saved.finishedAt < saved.startedAt))) return null;
    return { ...saved, elapsedSeconds: saved.phase === "running" && Number.isFinite(saved.measuredAt) ? getCalculationElapsedSeconds(saved.elapsedSeconds, saved.measuredAt!, Date.now()) : saved.elapsedSeconds, phase: saved.phase === "running" ? "paused" : saved.phase };
  } catch { return null; }
};

const CalculationStopwatch = ({ familyId, uid, sample, onSave, diagnostic, startLabel, taskId, taskLabel, blocked, blockedReason = "OTHER_TIMER", onRunningChange, average }: { average: ReturnType<typeof targetAverage>; onRunningChange: (running: boolean) => void; taskId: string; taskLabel: string; blocked: boolean; blockedReason?: DiagnosticCode; familyId: string; uid: string; sample: boolean; onSave: (draft: CalculationDraft) => Promise<CalculationAttempt>; diagnostic: boolean; startLabel: string }) => {
  const [active, setActive] = useState<ActiveCalculation | null>(() => sample ? null : readActive(familyId, uid, taskId));
  const [elapsed, setElapsed] = useState(active?.elapsedSeconds ?? 0);
  const [customTarget, setCustomTarget] = useState<number | null>(null);
  const [operationCheck, setOperationCheck] = useState(false);
  const targetSeconds = active?.targetSeconds ?? customTarget ?? average.seconds;
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
  const change = (value: ActiveCalculation | null) => { if (value) value = { ...value, measuredAt: Date.now() }; saveLocal(value); current.current = value; setActive(value); if (mounted.current) onRunningChange(value?.phase === "running"); };
  useEffect(() => {
    mounted.current = true;
    const tick = () => {
      const value = current.current;
      if (value?.phase !== "running") return;
      const seconds = Math.max(value.elapsedSeconds, getCalculationElapsedSeconds(anchor.current.elapsed, anchor.current.at, Date.now()));
      current.current = { ...value, elapsedSeconds: seconds };
      setElapsed(seconds);
      if (!sample) {
        try { localStorage.setItem(`${calculationStorageKey(familyId, uid, value.dateKey)}-${taskId}`, JSON.stringify({ ...value, elapsedSeconds: seconds, measuredAt: Date.now() })); } catch { /* Save remains available. */ }
      }
    };
    const timer = window.setInterval(tick, 250);
    window.addEventListener("pagehide", tick);
    window.addEventListener("pageshow", tick);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { tick(); mounted.current = false; onRunningChange(false); window.clearInterval(timer); window.removeEventListener("pagehide", tick); window.removeEventListener("pageshow", tick); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [familyId, uid, sample, taskId, onRunningChange]);
  const start = () => {
    if (targetSeconds < 1) { setError("目標時間は1秒以上にしてください。"); return; }
    if (blocked || busy.current || (current.current && current.current.phase !== "paused")) { recordDiagnostic({ type: "GUARD", source, button: "START", code: blocked ? blockedReason : busy.current ? "BUSY" : "WRONG_PHASE" }); return; }
    recordDiagnostic({ type: "HANDLER", source, button: active?.phase === "paused" ? "RESUME" : "START" });
    const now = Date.now();
    const value: ActiveCalculation = active?.phase === "paused" ? { ...active, phase: "running" } : { id: crypto.randomUUID(), dateKey: getJstDateKey(now), startedAt: now, elapsedSeconds: 0, score: 0, operationCheck, phase: "running" };
    anchor.current = { elapsed: value.elapsedSeconds, at: now };
    setElapsed(value.elapsedSeconds); change({ ...value, targetSeconds: value.targetSeconds ?? targetSeconds }); setError(""); setSaved(false);
  };
  const finish = () => {
    if (!active || (current.current?.phase !== "running" && current.current?.phase !== "paused")) { recordDiagnostic({ type: "GUARD", source, button: "STOP", code: "WRONG_PHASE" }); return; }
    recordDiagnostic({ type: "HANDLER", source, button: "STOP" }); transition("stopping");
    const seconds = current.current.phase === "paused" ? current.current.elapsedSeconds : Math.max(current.current.elapsedSeconds, getCalculationElapsedSeconds(anchor.current.elapsed, anchor.current.at, Date.now()));
    setElapsed(seconds);
    change({ ...active, elapsedSeconds: seconds, finishedAt: Math.max(active.startedAt, Date.now()), phase: "scoring" });
  };
  const save = async () => {
    const log = scopedDiagnosticRecorder();
    if (!active || active.phase !== "scoring" || busy.current) { recordDiagnostic({ type: "GUARD", source, button: "SAVE", code: busy.current ? "BUSY" : "WRONG_PHASE" }); return; }
    recordDiagnostic({ type: "HANDLER", source, button: "SAVE" }); transition("saving");
    recordDiagnostic({ type: "SAVE_START", source });
    busy.current = true; setSaving(true); setError("");
    try { await onSave({ id: active.id, dateKey: active.dateKey, score: active.score, elapsedSeconds: active.elapsedSeconds, startedAt: active.startedAt, finishedAt: active.finishedAt!, taskId, taskLabel, targetSeconds: active.targetSeconds ?? targetSeconds, operationCheck: active.operationCheck ?? false }); log({ type: "SAVE_SUCCESS", source }); transition("saved", log); change(null); setSaved(true); }
    catch (error) { log({ type: "SAVE_FAILURE", source, code: normalizeDiagnosticError(error), retry: true }); transition("failed", log); transition("retryable", log); setError("保存できなかったよ。記録は残っているので、もう一度保存してね。"); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section className="rounded-3xl bg-white p-5 shadow-sm">
    <TargetTime seconds={targetSeconds} elapsed={elapsed} sessionId={active?.id ?? ""} running={active?.phase === "running"} locked={saving || active?.phase === "scoring"} count={average.count} provisional={average.provisional} manual={targetSeconds !== average.seconds} averageSeconds={average.seconds} onChange={setCustomTarget} onLater={() => { const value = current.current; if (value?.phase === "running") { const seconds = Math.max(value.elapsedSeconds, getCalculationElapsedSeconds(anchor.current.elapsed, anchor.current.at, Date.now())); setElapsed(seconds); change({ ...value, elapsedSeconds: seconds, phase: "paused" }); } }} onEnd={finish} />
    <label className="block p-2 text-sm"><input type="checkbox" disabled={active?.phase === "running" || saving} checked={active?.operationCheck ?? operationCheck} onChange={e => active ? change({ ...active, operationCheck: e.target.checked }) : setOperationCheck(e.target.checked)} />操作確認（平均時間の対象外）</label>
    <h2 className="text-xl font-black">計算の結果を記録</h2><p className="mt-2 text-sm">計算時間は学習時間・活動Pには重ねて加えないよ。スリープから戻ると経過時間を確認するよ。画面を開き直したときは、端末に残った時間から再開してね。</p>{blocked && <p role="status" className="mt-2">先に学習タイマーを終了して、途中の学習記録を保存してね。</p>}
    <p role="status" className="mt-3 text-center font-bold">{saving ? "結果を保存中…" : error ? "記録を確認して、もう一度ためしてね。" : saved ? "結果を保存したよ！" : active?.phase === "running" ? "計測中" : active?.phase === "scoring" ? "計測終了。得点を選んで結果を確認してね。" : active?.phase === "paused" ? "計測をお休み中" : "準備ができたら計算をはじめよう"}</p>
    <p className="my-4 text-center font-mono text-4xl font-black" aria-live="off">{formatCalculationTime(elapsed)}</p>
    {!active && <DiagnosticButton source={source} action="START" reason={blocked ? blockedReason : "NONE"} className="w-full rounded-2xl bg-blue-600 p-5 text-xl font-black text-white" disabled={blocked} onClick={start}>{startLabel}</DiagnosticButton>}
    {active?.phase === "paused" && <><p className="mb-3">計測をお休みしているよ。続きから再開してね。</p><DiagnosticButton source={source} action="RESUME" reason={blocked ? blockedReason : "NONE"} className="w-full rounded-2xl bg-blue-600 p-4 font-bold text-white" disabled={blocked} onClick={start}>計測を再開</DiagnosticButton></>}
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
  const [pastAttempts, setPastAttempts] = useState<CalculationAttempt[]>([]);
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
  useEffect(() => {
    if (!db || sample) return;
    let current = true;
    void loadCalculationHistory(db, familyId, uid, today).then(rows => {
      if (current) setPastAttempts(rows);
    }).catch(() => { if (current) setError("過去の目標時間用履歴を読み込めません。仮設定で利用できます。"); });
    return () => { current = false; };
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
    <CalculationStopwatch average={targetAverage(calculationEvidence(sample ? sampleAttempts : [...pastAttempts, ...attempts]), taskId, taskLabel, record ? "redo" : "first")} familyId={familyId} uid={uid} sample={sample} onSave={save} diagnostic={diagnostic} taskId={taskId} taskLabel={taskLabel} onRunningChange={onRunningChange} blocked={blocked} blockedReason={blockedReason} startLabel={calculationStartLabel(record)} />
    {record && <p className="font-bold">今日の最新 {record.latestScore}/7 ・ {formatCalculationTime(record.latestElapsedSeconds)} / 解き直し{record.attemptCount - 1}回 / {record.bestScore === 7 ? "7/7達成" : "チャレンジ中"}</p>}
    <p className="text-sm">目標時間は最近30学習日の採点済み7問を、同一タスク優先・初回と解き直し別で照合するよ。保存した結果とグラフは「実績 → 計算の記録」で見られるよ。7/7になった後も何度でも挑戦できるよ。</p>
  </div>;
};

type CalculationGoals = { score: number | null; elapsedSeconds: number | null };

const parseGoal = (value: string, max: number, min = 0) => {
  const number = Number(value);
  return value.trim() && Number.isInteger(number) && number >= min && number <= max ? number : null;
};

const readGoals = (key: string): CalculationGoals => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    return {
      score: parseGoal(String(saved?.score ?? ""), 7),
      elapsedSeconds: parseGoal(String(saved?.elapsedSeconds ?? ""), MAX_CALCULATION_SECONDS, 1),
    };
  } catch { return { score: null, elapsedSeconds: null }; }
};

const CalculationGraph = ({ data, valueKey, title, goal, range = "all" }: {
  data: { label: string; score: number; elapsedSeconds: number }[];
  valueKey: keyof CalculationGoals; title: string; goal: number | null; range?: CalculationChartRange;
}) => {
  const score = valueKey === "score";
  const { entries, average } = calculationChartSeries(data, range, valueKey);
  const last = entries.at(-1);
  const valueText = (value: number) => score ? `${value.toFixed(1).replace(/\.0$/, "")}点` : formatCalculationTime(Math.round(value));
  const formatLabel = (label: string) => /^\d{4}-\d{2}-\d{2}$/.test(label) ? label.slice(5).replace("-", "/") : label;
  const status = (value: number) => goal === null ? "" : calculationGoalMet(valueKey, value, goal) ? "（達成）" : "（未達成）";
  return (
    <section className="design20-series" aria-label={title}>
      <div className="design20-series-header">
        <h3>{title}</h3>
        <span className="design20-series-unit">{score ? "7点満点" : "分:秒"}</span>
      </div>
      {last && average !== null ? (
        <>
          <div className="calculation-chart-legend">
            <span><i className="calculation-chart-actual" />実績（最新 {valueText(last[valueKey])}{status(last[valueKey])}）</span>
            <span><i className="calculation-chart-average" />平均 {valueText(average)}</span>
            {goal !== null && <span><i className="calculation-chart-goal" />目標 {valueText(goal)}</span>}
          </div>
          <ResponsiveContainer width="100%" height={176}>
            <LineChart data={entries} margin={{ top: 10, right: 14, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tickFormatter={formatLabel} tick={{ fontSize: 11 }} minTickGap={20} tickMargin={5} />
              <YAxis width={score ? 24 : 44} tick={{ fontSize: 11 }} allowDecimals={false} tickFormatter={score ? undefined : valueText} domain={score ? [0, 7] : [0, "auto"]} />
              <Tooltip formatter={value => [`${valueText(Number(value))}${status(Number(value))}`, "実績"]} />
              <ReferenceLine className="calculation-chart-average-line" y={average} stroke="#475569" strokeWidth={4} strokeDasharray="6 4" zIndex={100} />
              {goal !== null && <ReferenceLine className="calculation-chart-goal-line" y={goal} ifOverflow="extendDomain" stroke="#a63a10" strokeWidth={6} strokeDasharray="2 3" zIndex={90} />}
              <Line dataKey={valueKey} name="実績" type="linear" stroke="#3947bf" strokeWidth={2} dot={entries.length <= 10 ? { r: 3 } : false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      ) : <p className="design20-series-empty">この課題の記録はまだありません。</p>}
    </section>
  );
};

// Reset records and selections at the identity boundary, including pending reads.
export const DailyCalculation = (props: CalculationProps) => <CalculationRecords key={JSON.stringify([props.familyId, props.uid, props.sample])} {...props} />;

const CalculationRecords = ({ db, familyId, uid, sample, sampleAttempts }: CalculationProps) => {
  const goalsKey = `calculation-goals-${JSON.stringify([familyId, uid, sample])}`;
  const [goals, setGoals] = useState(() => readGoals(goalsKey));
  const [range, setRange] = useState<CalculationChartRange>(10);
  const [goalMessage, setGoalMessage] = useState("");
  const [scoreMode, setScoreMode] = useState<CalculationScoreMode>("first");
  const [days, setDays] = useState<CalculationDay[]>([]);
  const [byDate, setByDate] = useState<Record<string, CalculationAttempt[]>>({});
  const [selectedDate, setSelectedDate] = useState(getJstDateKey);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [loading, setLoading] = useState(!sample);
  const [error, setError] = useState("");
  const [logLimit, setLogLimit] = useState(30);
  const [detailTask, setDetailTask] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const requestedDetailDate = useRef<string | null>(null);
  useEffect(() => {
    if (!db || sample) return;
    return onSnapshot(query(getCalculationDays(db, familyId, uid), orderBy("dateKey", "desc")), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      setDays(snapshot.docs.map(item => item.data() as CalculationDay)); setLoading(false);
    }, () => { setLoading(false); setError("記録を読み込めなかったよ。画面を開き直してね。"); });
  }, [db, familyId, uid, sample]);
  const dates = days.map(day => day.dateKey).sort().join(",");
  useEffect(() => {
    if (!db || sample || !dates) return;
    const stops = dates.split(",").map(dateKey => onSnapshot(query(getCalculationAttempts(db, familyId, uid, dateKey), orderBy("attemptNo")), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      setByDate(current => ({ ...current, [dateKey]: snapshot.docs.map(item => item.data() as CalculationAttempt) }));
    }, () => setError("この日の記録を読み込めなかったよ。画面を開き直してね。")));
    return () => stops.forEach(stop => stop());
  }, [db, familyId, uid, sample, dates]);
  const attempts = useMemo(() => sample ? sampleAttempts : days.flatMap(day => byDate[day.dateKey] ?? []), [sample, sampleAttempts, days, byDate]);
  const records = useMemo(() => calculationTaskRecords(attempts), [attempts]);
  const taskOptions = [...new Map(records.map(item => [item.taskId, item.taskLabel])).entries()];
  const taskId = selectedTask;
  const trend = calculationDateTrend(attempts, taskId, scoreMode);
  const trendLoading = !sample && !error && (loading || days.some(day => !(day.dateKey in byDate)));
  const scoreLabel = taskId === null ? "初回" : scoreMode === "latest" ? "最新" : scoreMode === "best" ? "最高" : "初回";
  const dayRecords = records.filter(item => item.dateKey === selectedDate);
  const selected = detailTask === null && taskId === null ? dayRecords[0] : dayRecords.find(item => item.taskId === (detailTask ?? taskId));
  const history = selected?.history ?? [];
  const detailLoading = trendLoading && dates.split(",").includes(selectedDate) && !(selectedDate in byDate);
  const logRecords = records.filter(record => taskId === null || record.taskId === taskId);
  const logDates = [...new Set(logRecords.map(record => record.dateKey))];
  const visibleDates = new Set(logDates.slice(0, logLimit));
  useEffect(() => {
    if (detailLoading || requestedDetailDate.current !== selectedDate) return;
    requestedDetailDate.current = null;
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [selectedDate, detailLoading]);
  const selectDay = (dateKey: string, id: string) => {
    setDetailTask(id);
    requestedDetailDate.current = dateKey;
    if (dateKey !== selectedDate) setSelectedDate(dateKey);
    else if (!detailLoading) { requestedDetailDate.current = null; requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  };
  return <section className="design20-calculation mx-auto w-full max-w-5xl min-w-0" aria-label="計算の記録">
    <div className="design20-calculation-heading">
      <div><span className="design20-calculation-eyebrow">DAILY CALCULATION</span><h2>毎日計算の記録</h2></div>
      <p>全課題では、その日に最初に始めた課題の初回を表示します。7点満点、記録のない日は0点にはしません。</p>
    </div>
    {loading && <p role="status">記録を読み込み中…</p>}{error && <p role="alert">{error}</p>}
    {!trendLoading && !error && !records.length && <p>まだ記録がないよ。「学習 → 算数 → 計算」のカードから結果を保存してね。</p>}
    <div className="design20-calculation-filters">
      <label>比較する課題<select aria-label="グラフで見る計算課題" value={taskId ?? "/all"} onChange={event => { setSelectedTask(event.target.value === "/all" ? null : event.target.value); setDetailTask(null); setLogLimit(30); }}><option value="/all">全課題</option>{taskOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>表示する得点<select aria-label="日付ごとに表示する得点" value={taskId === null ? "first" : scoreMode} disabled={taskId === null} onChange={event => setScoreMode(event.target.value as CalculationScoreMode)}><option value="first">初回</option><option value="latest">最新</option><option value="best">最高</option></select></label>
    </div>
    <div className="design20-calculation-filters mt-2">
      <label>表示する記録<select aria-label="グラフの表示件数" value={range} disabled={trendLoading} onChange={event => {
        const next = event.target.value;
        setRange(next === "all" ? next : next === "30" ? 30 : 10);
      }}><option value="10">直近10記録日</option><option value="30">直近30記録日</option><option value="all">すべて</option></select></label>
    </div>
    <details className="my-3 text-sm">
      <summary className="cursor-pointer py-2 font-bold">{goals.score === null || goals.elapsedSeconds === null ? "得点・所要時間の目標を設定しよう" : "目標を変更する"}</summary>
      <form className="flex flex-wrap items-end gap-2 py-2" onSubmit={event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const next = { score: parseGoal(String(fields.get("score")), 7), elapsedSeconds: parseGoal(String(fields.get("seconds")), MAX_CALCULATION_SECONDS, 1) };
        try {
          localStorage.setItem(goalsKey, JSON.stringify(next));
          setGoals(next);
          setGoalMessage("目標を保存したよ。");
        } catch { setGoalMessage("目標を保存できなかったよ。ブラウザの設定を確認してね。"); }
      }} onChange={() => setGoalMessage("")}>
        <label>得点目標（点）<input className="block w-28 rounded-lg border border-slate-300 bg-white p-2" name="score" type="number" min={0} max={7} defaultValue={goals.score ?? ""} /></label>
        <label>所要時間目標（秒）<input className="block w-28 rounded-lg border border-slate-300 bg-white p-2" name="seconds" type="number" min={1} max={MAX_CALCULATION_SECONDS} defaultValue={goals.elapsedSeconds ?? ""} /></label>
        <button className="rounded-lg bg-blue-700 px-3 py-2 font-bold text-white" type="submit">目標を保存</button>
      </form>
      <p>空欄で保存すると目標を解除できます。目標はこのブラウザに保存します。</p>
      <p role="status">{goalMessage}</p>
    </details>
    <p className="design20-calculation-status" role="status">{trendLoading ? "日付別の記録を読み込み中…" : error ? "" : trend.length === 1 ? "1日分の記録です。推移を判断するには別の日の記録が必要です。" : `比較できる記録：${range === "all" ? trend.length : Math.min(range, trend.length)}日分（JST）`}</p>
    {!trendLoading && !error && <div className="design20-calculation-charts">
      <CalculationGraph data={trend} valueKey="score" title={`日付別・${scoreLabel}得点`} goal={goals.score} range={range} />
      <CalculationGraph data={trend} valueKey="elapsedSeconds" title="日付別・初回所要時間" goal={goals.elapsedSeconds} range={range} />
    </div>}
    <section className="design20-calculation-log"><h3>日ごとの記録</h3><p>表示中の課題を日付順に確認できます。</p><div className="design20-calculation-log-list">{logRecords.filter(record => visibleDates.has(record.dateKey)).map(record => <button key={JSON.stringify([record.dateKey, record.taskId])} className={"w-full rounded-xl border p-3 text-left " + (selectedDate === record.dateKey && selected?.taskId === record.taskId ? "border-blue-500 bg-blue-50" : "border-slate-100")} onClick={() => selectDay(record.dateKey, record.taskId)}><strong>{record.dateKey} / {record.taskLabel}</strong><p>初回 {record.firstScore}/7 ・ {formatCalculationTime(record.firstElapsedSeconds)}</p><p>最新 {record.latestScore}/7 ・ {formatCalculationTime(record.latestElapsedSeconds)}</p><p className="text-sm">最高 {record.bestScore}/7 / 解き直し{record.attemptCount - 1}回 / {record.bestScore === 7 ? "7/7達成" : "チャレンジ中"}</p></button>)}</div>{logDates.length > logLimit && <button className="mt-3 w-full rounded-xl bg-slate-100 p-3 font-bold" onClick={() => setLogLimit(logLimit + 30)}>もっと前の日を見る</button>}</section>
    <section ref={detailRef} className="design20-calculation-detail scroll-mt-4">
      <h3 className="font-black">{selectedDate} / {selected?.taskLabel ?? "課題未指定"} / この日の解き直し</h3>
      <p className="text-sm text-slate-600">解き直しで解く問題数が違う場合、時間だけでは比べられないよ。短い時間でも得点が下がったときは、改善したとはいえないよ。</p>
      {detailLoading ? <p role="status">読み込み中…</p> : error ? <p>記録の読み込み状況は上の案内を確認してね。</p> : <><div className="design20-calculation-charts"><CalculationGraph data={history} valueKey="score" title="この日の各回の得点" goal={goals.score} /><CalculationGraph data={history} valueKey="elapsedSeconds" title="この日の各回の所要時間" goal={goals.elapsedSeconds} /></div>
      <h4 className="font-bold">この日の全課題・全記録</h4>{dayRecords.length ? dayRecords.map(record => <div key={record.taskId}><h5 className="font-bold">{record.taskLabel}</h5><ol className="mt-3 space-y-2">{record.history.map(attempt => <li key={attempt.id} className="rounded-xl bg-slate-50 p-3"><p className="font-bold">{attempt.label}</p><p>{attempt.score}/7 ・ {formatCalculationTime(attempt.elapsedSeconds)}</p></li>)}</ol></div>) : <p>この日の記録はまだないよ。</p>}</>}
    </section>
  </section>;
};
