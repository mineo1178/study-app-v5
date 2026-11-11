import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatCalculationTime } from "../daily-calculation";

export function TargetTime({ seconds, elapsed, sessionId, running, locked, settingsLocked = false, manual = false, averageSeconds, count, provisional, onChange, onLater, onEnd }: { seconds: number; elapsed: number; sessionId: string; running: boolean; locked: boolean; settingsLocked?: boolean; manual?: boolean; averageSeconds?: number; count: number; provisional: boolean; onChange: (seconds: number) => void; onLater: () => void; onEnd: () => void }) {
  const messageId = useId();
  const [acknowledged, setAcknowledged] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const played = useRef("");
  const reached = seconds > 0 && elapsed >= seconds;
  const key = `${sessionId}:${seconds}`;
  const storageKey = `study-target-ack:${key}`;
  const beep = useCallback(() => {
    try {
      const context = audio.current;
      if (!context || context.state !== "running") return;
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.frequency.value = 880; gain.gain.value = .15;
      oscillator.start(); oscillator.stop(context.currentTime + .6);
    } catch { /* The visible notification remains available without audio. */ }
  }, []);
  useEffect(() => () => { void audio.current?.close(); }, []);
  useEffect(() => {
    if (!reached || !sessionId || played.current === key) return;
    played.current = key;
    try { if (localStorage.getItem(storageKey)) return; } catch { /* Display the alert if storage is unavailable. */ }
    beep();
  }, [reached, sessionId, key, storageKey, beep]);
  const acknowledge = () => { setAcknowledged(key); try { localStorage.setItem(storageKey, "1"); } catch { /* Current screen still acknowledges it. */ } };
  return <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm">
    <p className="font-bold">目標時間 {formatCalculationTime(seconds)} {manual ? "（手動設定）" : provisional ? "（仮設定）" : "（同条件の採点済み平均）"} · 対象{count}件</p>
    <fieldset disabled={locked || running || settingsLocked} className="flex flex-wrap items-center gap-2"><legend>目標時間を設定</legend>{averageSeconds !== undefined && count > 0 && <button type="button" className="rounded border bg-white p-2" onClick={()=>onChange(averageSeconds)}>履歴平均 {formatCalculationTime(averageSeconds)} を使う</button>}{[3, 5, 7, 10, 15].map(m => <button type="button" key={m} className="rounded-lg border bg-white px-3 py-2" onClick={() => onChange(m * 60)}>{m}分</button>)}<label>分<input aria-label="目標時間の分" className="w-16 rounded border p-2" type="number" min={0} max={240} value={Math.floor(seconds / 60)} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 0 && n * 60 + seconds % 60 <= 14400) onChange(n * 60 + seconds % 60); }} /></label><label>秒<input aria-label="目標時間の秒" className="w-16 rounded border p-2" type="number" min={0} max={59} value={seconds % 60} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 0 && n < 60 && Math.floor(seconds / 60) * 60 + n <= 14400) onChange(Math.floor(seconds / 60) * 60 + n); }} /></label></fieldset>
    {seconds === 0 && <p role="alert">目標時間は1秒以上にしてください。</p>}
    <button type="button" className="mt-2 rounded border bg-white p-2" onClick={() => { audio.current ??= new AudioContext(); void audio.current.resume().then(beep); }}>音を有効にして試す</button>
    <p className="mt-2 text-xs">画面ロック・スリープ中の音は保証できません。復帰時に経過時間と到達を表示します。実際の所要時間は別に記録します。</p>
    {reached && <p className="font-bold text-amber-900">目標より {formatCalculationTime(Math.max(0, elapsed - seconds))} 超過</p>}
    {reached && sessionId && acknowledged !== key && !isAcknowledged(storageKey) && <div role="alertdialog" aria-label="目標時間に到達" aria-describedby={messageId} className="mt-3 space-y-2 rounded-xl bg-white p-3"><p id={messageId}>目標時間になったよ。続けても大丈夫！</p><div className="flex flex-wrap gap-2"><button disabled={locked} className="rounded border p-3" onClick={acknowledge}>続ける</button><button disabled={locked} className="rounded border p-3" onClick={() => { acknowledge(); onLater(); }}>後で戻る</button><button disabled={locked} className="rounded border p-3" onClick={() => { acknowledge(); onEnd(); }}>終了</button></div></div>}
  </div>;
}

function isAcknowledged(key: string) { try { return localStorage.getItem(key) === "1"; } catch { return false; } }
