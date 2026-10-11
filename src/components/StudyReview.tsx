import { useRef, useState } from "react";
import type { StudyHistoryEntry } from "../study-utils";

type Pending = { taskId: string; subject: string; title: string; entry: StudyHistoryEntry & { id: string } };
export const StudyReview = ({ records, onConfirm }: { records: Pending[]; onConfirm: (taskId: string, sessionId: string, seconds: number) => Promise<void> }) => {
  const [open, setOpen] = useState(false);
  const [shorten, setShorten] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const record = records[0];
  if (!record) return null;
  const confirm = async (seconds: number) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try { await onConfirm(record.taskId, record.entry.id, seconds); setOpen(false); setShorten(false); }
    catch { setError("保存できなかったよ。時間はそのまま残っているので、もう一度確認してね。"); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section className="m-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <button className="w-full text-left font-bold" onClick={() => { setOpen(true); setShorten(false); setError(""); }}>勉強した時間を確認しよう（確認待ち {records.length}件）</button>
    {open && <div className="mt-3 space-y-3">
      <p>しばらく画面をさわっていない時間があったよ。ほんとうに勉強した時間を確認してね。</p>
      <p className="font-bold">{record.subject} / {record.title}</p>
      <p>タイマーで記録した時間：{Math.floor(record.entry.duration / 60)}分{record.entry.duration % 60}秒</p>
      <p>{record.entry.reviewReasons?.includes("idle") ? "15分間画面をさわらなかったので、計測を止めたよ。" : "画面を閉じていた時間が5分以上あったよ。"}</p>
      <p>実際に勉強した時間：{shorten ? `${minutes}分` : `${Math.floor(record.entry.duration / 60)}分${record.entry.duration % 60}秒`}</p>
      {shorten && <label className="block">勉強した分数 <input aria-label="勉強した分数" className="w-24 rounded border p-2" type="number" min="0" max={Math.floor(record.entry.duration / 60)} step="1" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label>}
      <div className="grid grid-cols-2 gap-2">
        <button disabled={saving || (shorten && (!Number.isInteger(minutes) || minutes < 0 || minutes * 60 > record.entry.duration))} className="rounded-xl bg-blue-600 p-3 font-bold text-white disabled:opacity-50" onClick={() => void confirm(shorten ? minutes * 60 : record.entry.duration)}>{saving ? "保存中…" : "この時間でOK"}</button>
        <button disabled={saving} className="rounded-xl bg-white p-3 font-bold" onClick={() => { setShorten(true); setMinutes(Math.floor(record.entry.duration / 60)); }}>時間を短くする</button>
        <button disabled={saving} className="rounded-xl bg-white p-3 font-bold" onClick={() => void confirm(0)}>0分にする</button>
        <button disabled={saving} className="rounded-xl bg-white p-3 font-bold" onClick={() => setOpen(false)}>あとで確認する</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>}
  </section>;
};
