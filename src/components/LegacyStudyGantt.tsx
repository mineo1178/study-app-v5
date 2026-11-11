import { loadCalculationHistory, withCalculationHistory } from "../planning/calculation-history";
import type { CalculationAttempt } from "../daily-calculation";
import { MaterialImport } from "./MaterialImport";
import type { newMaterialTask } from "../planning/materials";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { doc, onSnapshot, runTransaction, type Firestore } from "firebase/firestore";
import { SUBJECTS, getJstDay, type Subject } from "../review/model";
import { addDays, aggregate, correctRangeInputs, dailyWork, difference, emptyPlan, makeBaseline, monday, normalizeCapacities, planOf, progressOf, rangeComplete, validatePlan, validatePlanTransition, type PlanRange, type PlanningTask, type TaskPlan } from "../planning/model";
import { saveTaskPlan } from "../planning/repository";
import "./StudyGantt.css";
const percent = (value: number | null) => value === null ? "進捗率未確認" : Math.round(value) + "%";
const diffText = (value: ReturnType<typeof difference>) => value ? (value.points >= 0 ? "+" : "") + value.points.toFixed(1) + "ポイント" : "未測定または基準未設定のため除外";
type Props = { tasks: PlanningTask[]; db: Firestore | null; familyId: string; uid: string; sample: boolean; active: () => boolean; onLocal: (id: string, updates: { planning: TaskPlan; status?: "completed" }) => void; onOpen: (id: string) => void; onCreated: (task: ReturnType<typeof newMaterialTask>) => void; calculationAttempts?: CalculationAttempt[] };
export function LegacyStudyGantt({ tasks, db, familyId, uid, sample, active, onLocal, onOpen, onCreated, calculationAttempts = [] }: Props) {
  const [today, setToday] = useState(() => getJstDay(Date.now()));
  const [start, setStart] = useState(() => monday(getJstDay(Date.now())));
  const [span, setSpan] = useState(7);
  const [selectedId, setSelectedId] = useState("");
  const [selectedRange, setSelectedRange] = useState("");
  const [draft, setDraft] = useState<TaskPlan>(emptyPlan);
  const [correction, setCorrection] = useState<{original: TaskPlan; ranges: PlanRange[]; reason: string} | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const settingsKey = `study-planning-sample:${familyId}:${uid}`;
  const [capacities, setCapacities] = useState<Record<string, number>>(() => { try { return sample ? normalizeCapacities(JSON.parse(localStorage.getItem(settingsKey) ?? "{}")) : {}; } catch { return {}; } });
  const [capacityDay, setCapacityDay] = useState(today), [capacityMinutes, setCapacityMinutes] = useState(60);
  const [manual, setManual] = useState("");
  const [label, setLabel] = useState(""), [units, setUnits] = useState(1), [minutes, setMinutes] = useState(15), [rangeDay, setRangeDay] = useState(today);
  const inFlight = useRef(false);
  const days = Array.from({ length: span }, (_, i) => addDays(start, i));
  const selected = tasks.find(t => t.id === selectedId);
  useEffect(() => {
    const tick = () => setToday(getJstDay(Date.now()));
    const timer = setInterval(tick, 60000); window.addEventListener("focus", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); };
  }, []);
  useEffect(() => {
    if (sample) return;
    if (!db) return;
    return onSnapshot(doc(db, "families", familyId, "studyPlanning", uid), snap => { if (active()) setCapacities(normalizeCapacities(snap.data()?.capacities)); }, () => { if (active()) setError("学習可能時間を読み込めません。接続を確認してください。"); });
  }, [db, familyId, uid, sample, settingsKey, active]);
  function choose(task: PlanningTask) { setCorrection(null); setSelectedId(task.id); setSelectedRange(""); setDraft(structuredClone(planOf(task))); setManual(""); setNotice(""); setError(""); }
  async function persist(plan: TaskPlan, complete = false) {
    if (!selected || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      validatePlan(plan);
      validatePlanTransition(planOf(selected), plan);
      if (complete && (selected.isRunning || (selected.currentDuration ?? 0) > 0 || !plan.ranges.length || !plan.ranges.every(rangeComplete))) throw new Error("タイマーを保存し、全範囲の採点・直しを終えてください。");
      if (!sample) {
        if (!db) throw new Error("保存先を確認できません。");
        await saveTaskPlan(db, familyId, selected.id, draft.revision, plan, active, complete);
      }
      if (!active()) return;
      const saved = { ...plan, revision: draft.revision + 1 };
      onLocal(selected.id, { planning: saved, ...(complete ? { status: "completed" as const } : {}) });
      setDraft(saved); setCorrection(null); setNotice("保存しました");
    } catch (e) { if (active()) setError((e as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function saveCapacity() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (!Number.isInteger(capacityMinutes) || capacityMinutes < 0 || capacityMinutes > 1440) throw new Error("学習可能時間は0〜1440分で設定してください。");
      if (sample) { const next = { ...capacities, [capacityDay]: capacityMinutes }; localStorage.setItem(settingsKey, JSON.stringify(next)); setCapacities(next); }
      else {
        if (!db) throw new Error("保存先を確認できません。");
        await runTransaction(db, async tx => {
          const ref = doc(db, "families", familyId, "studyPlanning", uid), snap = await tx.get(ref);
          if (!active()) throw new Error("利用者が切り替わりました。");
          tx.set(ref, { schemaVersion: 1, capacities: { ...(snap.data()?.capacities ?? {}), [capacityDay]: capacityMinutes } });
        });
      }
      if (active()) setNotice("学習可能時間を保存しました");
    } catch (e) { if (active()) setError((e as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function createBaseline() {
    if (!selected || busy || inFlight.current) return;
    setBusy(true); setError("");
    try {
      const rows = selected.category === "計算" ? sample ? calculationAttempts : db ? await loadCalculationHistory(db, familyId, uid) : [] : [];
      if (!active()) return;
      const enriched = withCalculationHistory(tasks, rows);
      const source = { ...(enriched.find(t=>t.id===selected.id) ?? selected), planning: draft };
      const next = makeBaseline(source, enriched, capacities, tasks, today, crypto.randomUUID(), manual ? Number(manual) : null);
      if (!next.targetDay) throw new Error("有効な履歴・手動時間、または学習可能時間が不足しています。目標基準は保存していません。");
      await persist({ ...draft, baseline: next, baselineHistory: [...draft.baselineHistory, ...(draft.baseline ? [draft.baseline] : [])] });
    } catch(e) { if (active()) setError((e as Error).message); }
    finally { if (active()) setBusy(false); }
  }
  const p = selected ? progressOf(selected) : null;
  const manualDiff = selected ? difference(p, dailyWork(planOf(selected)), today) : null;
  const goalDiff = selected ? difference(p, planOf(selected).baseline?.daily ?? null, today) : null;
  const unplaced = tasks.filter(t => t.status !== "completed" && (!planOf(t).ranges.length || planOf(t).ranges.some(r => !r.day)));
  const orderedTasks = [...tasks].sort((a,b) => (planOf(a).order ?? 0) - (planOf(b).order ?? 0));
  const groups = [...new Set(tasks.map(t => t.unit))].sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
  return <section className="study-gantt" aria-label="学習ガントチャート">
    <header><h2>学習ガントチャート</h2><p>宿題の完了を確認しよう。日を空けた定着確認は「対策・復習」で別に管理するよ。</p></header>
    <div className="gantt-toolbar"><button onClick={() => setStart(addDays(start, -7))}>前週</button><button onClick={() => setStart(monday(today))}>今日へ戻る</button><button onClick={() => setStart(addDays(start, 7))}>翌週</button><label>表示<select aria-label="表示" value={span} onChange={e => setSpan(Number(e.target.value))}><option value={7}>1週間</option><option value={14}>2週間</option></select></label></div>
    <p>{start} 〜 {days.at(-1)}（JST）</p>
    {error && <p role="alert" className="gantt-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <details><summary>保護者：学習可能時間</summary><fieldset disabled={busy}><label>日付<input type="date" value={capacityDay} onChange={e => setCapacityDay(e.target.value)} required /></label><label>学習可能な分数<input type="number" min={0} max={1440} value={capacityMinutes} onChange={e => setCapacityMinutes(Number(e.target.value))} /></label><button onClick={() => void saveCapacity()} disabled={!capacityDay}>保存</button><p>未設定日は0分として目標日計算から除外します。登録した本人の設定です。</p></fieldset></details>
    <div className="gantt-loads">{days.map(day => {
      const booked = tasks.flatMap(t => planOf(t).ranges).filter(r => r.day === day).reduce((n, r) => n + r.minutes, 0), cap = capacities[day];
      const alternative = days.find(d => d > day && (capacities[d] ?? 0) - tasks.flatMap(t => planOf(t).ranges).filter(r => r.day === d).reduce((n, r) => n + r.minutes, 0) >= Math.max(0, booked - (cap ?? 0)));
      return <div key={day} className={cap !== undefined && booked > cap ? "gantt-error" : ""}><strong>{day.slice(5)}</strong> {booked}分 / {cap === undefined ? "可能時間未設定" : cap + "分"}{cap !== undefined && booked > cap && <p>予定超過 {booked - cap}分。{alternative ? alternative.slice(5) + "へ移動を検討" : "可能時間を確認しよう"}（自動移動しません）</p>}</div>;
    })}</div>
    <details><summary>未配置の課題：{unplaced.length}件</summary>{unplaced.map(t => <button disabled={busy} key={t.id} onClick={() => choose(t)}>{t.unit} / {SUBJECTS[t.subject as Subject]} / {t.materialName || t.category} / {t.title}</button>)}</details>
    <MaterialImport tasks={tasks} db={db} familyId={familyId} sample={sample} active={active} onLocal={onLocal} onCreated={onCreated} />
    <div className="gantt-legend"><span>赤い実線：手動計画</span><span>紫の破線：固定目標基準</span><span>今日の縦線から左＝遅れ／右＝先行</span><span>青＝予定、緑＝実績</span></div>
    <div className="gantt-table" style={{ "--gantt-days": span } as CSSProperties}>
      <div className="gantt-head"><span>回／教科／教材・範囲</span><span>進捗率</span><span>終了予定日</span><span>履歴からの目標終了日</span><div className="gantt-dates">{days.map(day => <span key={day} className={day === today ? "is-today" : ""}>{day.slice(5)}</span>)}</div></div>
      {groups.map(unit => <details open key={unit} className="gantt-unit"><summary>{unit} · {percent(aggregate(tasks.filter(t => t.unit === unit)))}</summary>{Object.entries(SUBJECTS).map(([subject, name]) => {
        const children = orderedTasks.filter(t => t.unit === unit && t.subject === subject);
        return children.length ? <details open key={subject}><summary>{name} · {percent(aggregate(children))}</summary>{[...new Set(children.map(t => t.materialName || t.category))].map(material => <details open key={material}><summary>{material} · {percent(aggregate(children.filter(t => (t.materialName || t.category) === material)))}</summary>{children.filter(t => (t.materialName || t.category) === material).map(task => {
          const plan = planOf(task), progress = progressOf(task), red = difference(progress, dailyWork(plan), today), purple = difference(progress, plan.baseline?.daily ?? null, today);
          const todayIndex = days.indexOf(today), center = (todayIndex + .5) / span * 100;
          return <div className="gantt-task" key={task.id} data-task-id={task.id}>
            <div className="gantt-row"><button disabled={busy} className={selectedId === task.id ? "is-selected" : ""} onClick={() => choose(task)}>{task.title}</button><span>{percent(progress)}</span><span>{plan.endDay || "未設定"}{plan.endDay && plan.endDay < today && task.status !== "completed" ? "（予定超過）" : ""}</span><span>{plan.baseline?.targetDay || "未設定"}{plan.baseline?.evidence.provisional ? "（仮目標）" : ""}</span>
              <div className="gantt-axis-scroll" role="region" aria-label={task.title + "の日付軸"} tabIndex={0}><div className="gantt-dates gantt-axis">{days.map(day => <button disabled={busy} key={day} className={day === today ? "is-today" : ""} aria-label={task.title + "を" + day + "に配置"} onClick={() => { if (selectedId === task.id && selectedRange) { setDraft({ ...draft, ranges: draft.ranges.map(r => r.id === selectedRange ? { ...r, day } : r) }); setNotice("配置を変更しました。計画を保存してください。"); } else { choose(task); } setRangeDay(day); }}><small>{day.slice(5)}</small><span className="gantt-plan">{plan.ranges.filter(r => r.day === day).length ? "予定" : "　"}</span><span className="gantt-actual">{plan.ranges.some(r => r.actualDay === day) ? "実績" : "　"}</span></button>)}
              {todayIndex >= 0 && <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="進捗差の稲妻線" className="gantt-lines"><line x1={center} x2={center} y1={0} y2={40} stroke="#64748b" strokeDasharray="1 1" />{[red, purple].map((diff, i) => diff && <polyline key={i} points={center + ",0 " + Math.max(0, Math.min(100, center + diff.points * .35)) + ",20 " + center + ",40"} fill="none" stroke={i ? "#7e22ce" : "#dc2626"} strokeWidth="1" strokeDasharray={i ? "2 1" : undefined} />)}</svg>}</div></div>
            </div>
            {selectedId === task.id && <p className="gantt-diff">手動計画差：{diffText(red)} ／ 固定目標差：{diffText(purple)}</p>}
            {plan.ranges.map(r => <div key={r.id} className="gantt-range">{r.label} · 作業量{r.units} · 予定{r.day || "未配置"} · 実績{r.actualDay || "未記録"} · {rangeComplete(r) ? "採点・直しまで完了" : r.done ? "範囲終了、採点・直しを確認" : "未完了"}</div>)}
          </div>;
        })}</details>)}</details> : null;
      })}</details>)}
    </div>
    {selected && <section className="gantt-editor" aria-label="選んだ課題の計画"><h3>{selected.unit} / {SUBJECTS[selected.subject as Subject]} / {selected.materialName || selected.category} / {selected.title}</h3><button disabled={busy} onClick={() => onOpen(selected.id)}>タスク・学習タイマーを開く</button><button disabled={busy} onClick={() => choose(selected)}>最新の保存済み計画を開き直す</button>
      <p>現在：{percent(p)} ／ 今日までの手動予定：{manualDiff ? percent(manualDiff.expected) : "未設定"} ／ 差：{diffText(manualDiff)}</p><p>今日までの目標：{goalDiff ? percent(goalDiff.expected) : "未設定"} ／ 差：{diffText(goalDiff)}</p>
      {selected.status === "completed" && !draft.ranges.every(rangeComplete) && <p>既存タスクの全体完了を優先して100%と表示しています。分割範囲の記録だけで過去の完了を取り消しません。</p>}
      <fieldset disabled={busy || !!correction}><label>課題の順番<input aria-label="課題の順番" type="number" min={0} max={10000} value={draft.order ?? 0} onChange={e=>setDraft({...draft,order:Number(e.target.value)})} /></label><p>小さい番号から取り組むよ。変更したら計画を保存してね。</p><label>日付タップで移動する範囲<select aria-label="日付タップで移動する範囲" value={selectedRange} onChange={e => setSelectedRange(e.target.value)}><option value="">新しい範囲を作る</option>{draft.ranges.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label><label>終了予定日<input type="date" value={draft.endDay} onChange={e => setDraft({ ...draft, endDay: e.target.value })} /></label><label>締切<input type="date" value={draft.deadline} onChange={e => setDraft({ ...draft, deadline: e.target.value })} /></label><p>終了予定日の変更では、日別配置と固定目標基準は変わりません。必要な範囲の日付も調整して保存してください。</p>
        {draft.ranges.map(r => <div key={r.id} className="gantt-range-editor"><strong>{r.label}（作業量{r.units}・{r.minutes}分）</strong><label>予定日<input type="date" value={r.day} onChange={e => setDraft({ ...draft, ranges: draft.ranges.map(item => item.id === r.id ? { ...item, day: e.target.value } : item) })} /></label>{([['done', '範囲が終了'], ['graded', '採点が完了'], ['corrected', '必要な直しが完了（直し不要も含む）']] as const).map(([key, text]) => <label key={key}><input type="checkbox" checked={r[key]} onChange={e => setDraft({ ...draft, ranges: draft.ranges.map(item => item.id === r.id ? { ...item, [key]: e.target.checked, ...(key === 'done' ? { actualDay: e.target.checked ? today : null } : {}) } : item) })} />{text}</label>)}<label>実績日<input type="date" value={r.actualDay ?? ""} onChange={e => setDraft({ ...draft, ranges: draft.ranges.map(item => item.id === r.id ? { ...item, actualDay: e.target.value || null } : item) })} /></label></div>)}
        <details open><summary>ページ・問題番号で分割する</summary>{draft.baseline && <p>固定目標を作成した後は作業量を固定します。日付配置と完了状態は変更できます。</p>}<label>範囲<input value={label} placeholder="1〜5ページ" maxLength={150} onChange={e => setLabel(e.target.value)} /></label><label>固定作業量（全範囲で同じ単位）<input type="number" min={1} value={units} onChange={e => setUnits(Number(e.target.value))} /></label><label>予定作業時間（分）<input type="number" min={1} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label><label>配置日<input type="date" value={rangeDay} onChange={e => setRangeDay(e.target.value)} /></label><button disabled={!!draft.baseline || !label.trim() || units <= 0 || minutes <= 0} onClick={() => { setDraft({ ...draft, ranges: [...draft.ranges, { id: crypto.randomUUID(), label: label.trim(), units, minutes, day: rangeDay, done: false, graded: false, corrected: false, actualDay: null, actualSeconds: null }] }); setLabel(""); }}>範囲を追加</button></details>
        <button onClick={() => void persist(draft)}>計画・範囲の進捗を保存</button><button disabled={!draft.ranges.length || !draft.ranges.every(rangeComplete) || selected.isRunning || (selected.currentDuration ?? 0) > 0} onClick={() => void persist(draft, true)}>課題全体を完了にする</button>
        <details><summary>履歴から目標基準を作成・再計画</summary><label>手動補正する合計時間（分・履歴不足時は必要）<input type="number" min={1} value={manual} onChange={e => setManual(e.target.value)} /></label><button disabled={!!manual && !(Number(manual) > 0)} onClick={() => void createBaseline()}>{draft.baseline ? "新しい目標基準を保存（旧基準も保持）" : "目標基準を作成して保存"}</button><p>他課題の配置時間を差し引いた空き時間へ割り当てます。未配置の他課題は時間未確定のため含みません。自動配置・予定変更はしません。</p></details>
        {draft.material && <label><input type="checkbox" checked={draft.material.selected} onChange={e => setDraft({ ...draft, material: { ...draft.material!, selected: e.target.checked } })} />教材「{draft.material.title}」を今週の対象にする</label>}
      </fieldset>
      <details><summary>範囲・作業量の入力訂正と履歴</summary><p>保存済みの入力を訂正します。固定目標は書き換えず旧基準の履歴へ保存し、訂正前後の範囲・理由も残します。訂正後は目標未設定となるため、必要なら明示的に新しい目標を作成してください。実績・タスクの完了状態は変更しません。</p>
        {!correction ? <button disabled={busy || !draft.ranges.length} onClick={() => { const original = structuredClone(planOf(selected)); setDraft(original); setCorrection({original,ranges:structuredClone(original.ranges),reason:""}); }}>保存済みの範囲入力を訂正</button> : <fieldset disabled={busy}><legend>入力訂正（未保存の他の編集は含めません）</legend>{correction.ranges.map((r,i)=><div key={r.id} className="gantt-range-editor"><label>訂正する範囲名<input aria-label={"訂正する範囲名"+(i+1)} value={r.label} maxLength={150} onChange={e=>setCorrection({...correction,ranges:correction.ranges.map((item,n)=>n===i?{...item,label:e.target.value}:item)})} /></label><label>訂正する作業量<input aria-label={"訂正する作業量"+(i+1)} type="number" min={1} max={10000} value={r.units} onChange={e=>setCorrection({...correction,ranges:correction.ranges.map((item,n)=>n===i?{...item,units:Number(e.target.value)}:item)})} /></label><label>訂正する予定分数<input aria-label={"訂正する予定分数"+(i+1)} type="number" min={1} max={1440} value={r.minutes} onChange={e=>setCorrection({...correction,ranges:correction.ranges.map((item,n)=>n===i?{...item,minutes:Number(e.target.value)}:item)})} /></label></div>)}<label>訂正理由<input aria-label="訂正理由" maxLength={200} value={correction.reason} onChange={e=>setCorrection({...correction,reason:e.target.value})} /></label><button disabled={!correction.reason.trim()} onClick={()=>{try{void persist(correctRangeInputs(correction.original,correction.ranges,correction.reason,crypto.randomUUID(),today));}catch(e){setError((e as Error).message);}}}>訂正を保存（旧目標を履歴へ残す）</button><button onClick={()=>setCorrection(null)}>訂正をやめる</button></fieldset>}
        {(draft.rangeCorrections ?? []).map(c=><p key={c.id}>{c.day}：{c.reason} ／ 旧目標 {c.baselineId ?? "未設定"} ／ {c.previousRanges.map(r=>r.label+"・作業量"+r.units+"・"+r.minutes+"分").join("、")} → {c.revisedRanges.map(r=>r.label+"・作業量"+r.units+"・"+r.minutes+"分").join("、")}</p>)}
      </details>
      {draft.baseline && <div><h4>固定目標：{draft.baseline.targetDay} {draft.baseline.evidence.provisional ? "（仮目標）" : ""}</h4><p>作成日：{draft.baseline.createdDay} / 基準ID：{draft.baseline.id}</p><p>推定合計{draft.baseline.evidence.estimatedMinutes ?? "未確認"}分 · 履歴{draft.baseline.evidence.count}件（初回{draft.baseline.evidence.firstCount ?? "未確認"}件・直し{draft.baseline.evidence.redoCount ?? "未確認"}件） · {draft.baseline.evidence.source} · 初回{draft.baseline.evidence.firstSeconds ?? "未確認"}秒 · 直し見込み{draft.baseline.evidence.redoSeconds ?? "未確認"}秒 / {draft.baseline.evidence.redoDaysKnown ? draft.baseline.evidence.redoDays + "日" : "日数未確認"} · 手動補正{draft.baseline.evidence.manualMinutes ?? "なし"}分</p><p>{draft.baseline.evidence.conditions}</p>{draft.deadline && draft.baseline.targetDay && draft.baseline.targetDay > draft.deadline && <p className="gantt-error">目標日が締切を超えています。時間配分を確認してください。</p>}</div>}
      <details><summary>旧目標基準：{draft.baselineHistory.length}件</summary>{draft.baselineHistory.map(b => <p key={b.id}>{b.createdDay} / {b.targetDay} / {b.id} / 履歴{b.evidence.count}件</p>)}</details>
    </section>}
    <p className="gantt-method">進捗＝採点・必要な直しまで終わった範囲の固定作業量 ÷ 全範囲の固定作業量。親は固定した予定作業時間を重みに加重平均します。未測定・重み未設定を含む親は進捗率未確認。途中を50%と推測しません。赤線＝実績% − 保存済み日別予定%の今日までの合計。紫線＝同じ実績% − 固定基準の今日までの合計。線の横幅はポイント差を可視化し、日数の遅れではありません。</p>
  </section>;
}
