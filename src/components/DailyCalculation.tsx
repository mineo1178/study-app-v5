import { useEffect, useMemo, useRef, useState } from "react";
import { getDocs, limit, onSnapshot, orderBy, query, where, type Firestore } from "firebase/firestore";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { calculationStorageKey, commitCalculationAttempt, formatCalculationTime, getCalculationAttempts, getCalculationDays, getCalculationElapsedSeconds, getJstDateKey, MAX_CALCULATION_SECONDS, type CalculationAttempt, type CalculationDay, type CalculationDraft } from "../daily-calculation";
import { calculationTaskRecords, calculationStartLabel } from "../daily-calculation-view";

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

const CalculationStopwatch = ({ familyId, uid, sample, onSave, diagnostic, startLabel, taskId, taskLabel, blocked, onRunningChange }: { onRunningChange: (running: boolean) => void; taskId: string; taskLabel: string; blocked: boolean; familyId: string; uid: string; sample: boolean; onSave: (draft: CalculationDraft) => Promise<CalculationAttempt>; diagnostic: boolean; startLabel: string }) => {
  const [active, setActive] = useState<ActiveCalculation | null>(() => sample ? null : readActive(familyId, uid, taskId));
  const [elapsed, setElapsed] = useState(active?.elapsedSeconds ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const anchor = useRef({ elapsed: active?.elapsedSeconds ?? 0, at: 0 });
  const busy = useRef(false);
  const current = useRef(active);
  const mounted = useRef(true);
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
    if (blocked || busy.current || (current.current && current.current.phase !== "paused")) return;
    const now = Date.now();
    const value: ActiveCalculation = active?.phase === "paused" ? { ...active, phase: "running" } : { id: crypto.randomUUID(), dateKey: getJstDateKey(now), startedAt: now, elapsedSeconds: 0, score: 0, phase: "running" };
    anchor.current = { elapsed: value.elapsedSeconds, at: performance.now() };
    setElapsed(value.elapsedSeconds); change(value); setError(""); setSaved(false);
  };
  const finish = () => {
    if (!active || current.current?.phase !== "running") return;
    const seconds = getCalculationElapsedSeconds(anchor.current.elapsed, anchor.current.at, performance.now());
    setElapsed(seconds);
    change({ ...active, elapsedSeconds: seconds, finishedAt: Math.max(active.startedAt, Date.now()), phase: "scoring" });
  };
  const save = async () => {
    if (!active || active.phase !== "scoring" || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try { await onSave({ id: active.id, dateKey: active.dateKey, score: active.score, elapsedSeconds: active.elapsedSeconds, startedAt: active.startedAt, finishedAt: active.finishedAt!, taskId, taskLabel }); change(null); setSaved(true); }
    catch { setError("保存できなかったよ。記録は残っているので、もう一度保存してね。"); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section className="rounded-3xl bg-white p-5 shadow-sm">
    <h2 className="text-xl font-black">計算の結果を記録</h2><p className="mt-2 text-sm">計算時間は学習時間・活動Pには重ねて加えないよ。画面を閉じると計測はお休みするよ。</p>{blocked && <p role="status" className="mt-2">先に学習タイマーを終了して、途中の学習記録を保存してね。</p>}
    <p role="status" className="mt-3 text-center font-bold">{saving ? "結果を保存中…" : error ? "記録を確認して、もう一度ためしてね。" : saved ? "結果を保存したよ！" : active?.phase === "running" ? "計測中" : active?.phase === "scoring" ? "計測終了。得点を選んで結果を確認してね。" : active?.phase === "paused" ? "計測をお休み中" : "準備ができたら計算をはじめよう"}</p>
    <p className="my-4 text-center font-mono text-4xl font-black" aria-live="off">{formatCalculationTime(elapsed)}</p>
    {!active && <button className="w-full rounded-2xl bg-blue-600 p-5 text-xl font-black text-white" disabled={blocked} onClick={start}>{startLabel}</button>}
    {active?.phase === "paused" && <><p className="mb-3">画面を開き直したので、計測をお休みしているよ。続きから再開してね。</p><button className="w-full rounded-2xl bg-blue-600 p-4 font-bold text-white" disabled={blocked} onClick={start}>計測を再開</button></>}
    {active?.phase === "running" && <button className="w-full rounded-2xl bg-emerald-600 p-5 text-xl font-black text-white" onClick={finish}>計算を終了して結果を記録</button>}
    {active?.phase === "scoring" && <div className="space-y-4"><p className="text-lg font-bold">得点 {active.score}/7 ・ 所要時間 {formatCalculationTime(active.elapsedSeconds)}</p><div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }, (_, score) => <button key={score} aria-pressed={active.score === score} disabled={saving} className={`rounded-xl p-3 text-xl font-black ${active.score === score ? "bg-blue-600 text-white" : "bg-slate-100"}`} onClick={() => change({ ...active, score })}>{score}</button>)}</div><button disabled={saving} className="w-full rounded-2xl bg-blue-600 p-4 font-bold text-white disabled:opacity-50" onClick={() => void save()}>{saving ? "保存中…" : "この結果を保存"}</button></div>}
    {active && <p className="mt-3 text-sm">記録する日：{active.dateKey}（始めた日）</p>}
    {error && <p className="mt-3" role="alert">{error}</p>}
    {diagnostic && <pre className="mt-3 overflow-hidden whitespace-pre-wrap break-all text-xs">{JSON.stringify({ activeCalculation: active?.id ?? null, dateKey: active?.dateKey, startedAt: active?.startedAt, elapsed }, null, 2)}</pre>}
  </section>;
};

type CalculationProps = { db: Firestore | null; familyId: string; uid: string; sample: boolean; sampleAttempts: CalculationAttempt[] };

export const CalculationInput = ({ db, familyId, uid, sample, sampleAttempts, onSampleSave, diagnostic, taskId, taskLabel, blocked, onRunningChange }: CalculationProps & { onRunningChange: (running: boolean) => void; onSampleSave: (attempt: CalculationAttempt) => void; diagnostic: boolean; taskId: string; taskLabel: string; blocked: boolean }) => {
  const [attempts, setAttempts] = useState<CalculationAttempt[]>([]);
  const [today, setToday] = useState(getJstDateKey);
  const [loading, setLoading] = useState(!sample);
  const [error, setError] = useState("");
  useEffect(() => { const timer = window.setInterval(() => setToday(getJstDateKey()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!db || sample) return;
    return onSnapshot(query(getCalculationAttempts(db, familyId, uid, today), orderBy("attemptNo")), snapshot => {
      setAttempts(snapshot.docs.map(item => item.data() as CalculationAttempt)); setLoading(false); setError("");
    }, () => { setLoading(false); setError("記録を読み込めなかったよ。保存済みの記録を確認するため、画面を開き直してね。"); });
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
    <CalculationStopwatch familyId={familyId} uid={uid} sample={sample} onSave={save} diagnostic={diagnostic} taskId={taskId} taskLabel={taskLabel} onRunningChange={onRunningChange} blocked={blocked} startLabel={calculationStartLabel(record)} />
    {record && <p className="font-bold">今日の最新 {record.latestScore}/7 ・ {formatCalculationTime(record.latestElapsedSeconds)} / 解き直し{record.attemptCount - 1}回 / {record.bestScore === 7 ? "7/7達成" : "チャレンジ中"}</p>}
    <p className="text-sm">保存した結果とグラフは「実績 → 計算の記録」で見られるよ。7/7になった後も何度でも挑戦できるよ。</p>
  </div>;
};

const CalculationGraph = ({ data, valueKey, title, score }: { data: { label: string; score: number; elapsedSeconds: number }[]; valueKey: "score" | "elapsedSeconds"; title: string; score: boolean }) => <section className="rounded-2xl bg-white p-4 min-w-0">
  <h3 className="font-bold">{title}</h3>{!score && <p className="text-sm">時間の単位：秒</p>}
  <div className="mt-2 h-56 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ left: -20, right: 10, bottom: 15 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" interval="preserveStartEnd" minTickGap={10} angle={-30} textAnchor="end" height={65} tick={{ fontSize: 11 }} /><YAxis domain={score ? [0, 7] : [0, "auto"]} ticks={score ? [0, 1, 2, 3, 4, 5, 6, 7] : undefined} /><Tooltip formatter={value => score ? String(value) + "/7" : formatCalculationTime(Number(value))} /><Line dataKey={valueKey} name={score ? "得点" : "所要時間"} stroke={score ? "#2563eb" : "#059669"} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
</section>;

export const DailyCalculation = ({ db, familyId, uid, sample, sampleAttempts }: CalculationProps) => {
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
  const trend = records.filter(item => item.taskId === taskId).slice(0, 30).reverse().map(item => ({ label: item.dateKey.slice(5), score: item.firstScore, elapsedSeconds: item.firstElapsedSeconds }));
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
  return <section className="mx-auto w-full max-w-2xl space-y-5 min-w-0" aria-label="計算の記録">
    <h2 className="text-2xl font-black">計算の記録</h2>
    <p className="text-sm">課題ごとに7点満点でくらべるよ。異なる課題の点数は合算しないよ。</p>
    {loading && <p role="status">記録を読み込み中…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !records.length && <p>まだ記録がないよ。「学習 → 算数 → 計算」のカードから結果を保存してね。</p>}
    <label className="block font-bold">グラフで見る計算課題<select aria-label="グラフで見る計算課題" className="mt-2 w-full rounded-xl border bg-white p-3 text-sm" value={taskId} onChange={event => setSelectedTask(event.target.value)}>{taskOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <CalculationGraph data={trend} valueKey="score" title="日付ごとの初回得点推移（7点満点）" score />
    <CalculationGraph data={trend} valueKey="elapsedSeconds" title="日付ごとの初回時間推移" score={false} />
    <section className="rounded-3xl bg-white p-4"><h3 className="font-black">日ごとの記録</h3><div className="mt-3 space-y-2">{records.map(record => <button key={JSON.stringify([record.dateKey, record.taskId])} className={"w-full rounded-xl border p-3 text-left " + (selectedDate === record.dateKey && taskId === record.taskId ? "border-blue-500 bg-blue-50" : "border-slate-100")} onClick={() => selectDay(record.dateKey, record.taskId)}><strong>{record.dateKey} / {record.taskLabel}</strong><p>初回 {record.firstScore}/7 ・ {formatCalculationTime(record.firstElapsedSeconds)}</p><p>最新 {record.latestScore}/7 ・ {formatCalculationTime(record.latestElapsedSeconds)}</p><p className="text-sm">最高 {record.bestScore}/7 / 解き直し{record.attemptCount - 1}回 / {record.bestScore === 7 ? "7/7達成" : "チャレンジ中"}</p></button>)}</div>{!sample && hasMore && dates.split(",").length >= 30 && <button className="mt-3 w-full rounded-xl bg-slate-100 p-3 font-bold" disabled={moreBusy} onClick={() => void more()}>{moreBusy ? "読み込み中…" : "もっと前の日を見る"}</button>}</section>
    <section ref={detailRef} className="scroll-mt-4 space-y-4 rounded-3xl bg-white p-4">
      <h3 className="font-black">{selectedDate} / {taskOptions.find(([id]) => id === taskId)?.[1] ?? "課題未指定"} / 得点と時間の推移</h3>
      <p className="text-sm text-slate-600">解き直しで解く問題数が違う場合、時間だけでは比べられないよ。短い時間でも得点が下がったときは、改善したとはいえないよ。</p>
      {detailLoading ? <p role="status">読み込み中…</p> : <><CalculationGraph data={history} valueKey="score" title="各回の得点推移（7点満点）" score /><CalculationGraph data={history} valueKey="elapsedSeconds" title="各回の所要時間推移" score={false} />
      <h4 className="font-bold">この日の全課題・全記録</h4>{dayRecords.length ? dayRecords.map(record => <div key={record.taskId}><h5 className="font-bold">{record.taskLabel}</h5><ol className="mt-3 space-y-2">{record.history.map(attempt => <li key={attempt.id} className="rounded-xl bg-slate-50 p-3"><p className="font-bold">{attempt.label}</p><p>{attempt.score}/7 ・ {formatCalculationTime(attempt.elapsedSeconds)}</p></li>)}</ol></div>) : <p>この日の記録はまだないよ。</p>}</>}
    </section>
  </section>;
};
