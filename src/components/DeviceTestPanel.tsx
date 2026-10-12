import { useEffect, useState } from "react";
import { exportDiagnostics, getDiagnosticHistory, subscribeDiagnostics } from "../device-test";

type Props = {
  version: string;
  tasks: { isRunning: boolean; history?: { reviewStatus?: string }[] }[];
  syncState: "synced" | "syncing" | "offline";
  lastSync: string;
  online: boolean;
  visibility: DocumentVisibilityState;
  retryQueueCount: number;
  activeStudyTaskId: string | null | undefined;
  activeStudyTaskError: boolean;
  restoreState: string;
};

export const DeviceTestPanel = ({ version, tasks, syncState, online, visibility, retryQueueCount, activeStudyTaskId, activeStudyTaskError }: Props) => {
  const [isOpen, setIsOpen] = useState(true);
  const [history, setHistory] = useState(getDiagnosticHistory);
  const [copyText, setCopyText] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    const refresh = () => { const events = getDiagnosticHistory(); setHistory(events); if (events.length === 0) { setCopyText(""); setCopyStatus(""); } };
    const unsubscribe = subscribeDiagnostics(refresh);
    const interval = window.setInterval(() => setHistory(getDiagnosticHistory()), 30000);
    return () => { unsubscribe(); clearInterval(interval); };
  }, []);
  const copy = async () => {
    const text = exportDiagnostics(version, navigator.userAgent);
    setCopyText(text);
    try { await navigator.clipboard.writeText(text); setCopyStatus("診断情報をコピーしました"); }
    catch { setCopyStatus("コピーできない場合は、下の診断情報を選択してコピーしてください"); }
  };
  if (!isOpen) return <button type="button" onClick={() => setIsOpen(true)} className="fixed top-2 left-2 z-[70] rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-xl">端末診断</button>;
  const rows = [
    ["network", online ? "online" : "offline"], ["sync", syncState], ["visibility", visibility],
    ["retry pending", String(retryQueueCount > 0)], ["study running", String(tasks.some(task => task.isRunning))],
    ["family read", activeStudyTaskError ? "failed" : activeStudyTaskId === undefined ? "unknown" : "success"],
    ["review pending", String(tasks.some(task => task.history?.some(entry => entry.reviewStatus === "pending")))],
  ];
  return <aside aria-label="端末診断" className="fixed inset-x-2 top-2 z-[70] mx-auto max-h-[72vh] max-w-lg overflow-y-auto rounded-xl border border-emerald-400 bg-slate-950/95 p-3 font-mono text-[11px] text-slate-100 shadow-2xl">
    <div className="mb-2 flex items-center justify-between gap-2"><strong className="text-emerald-300">{version} DEVICE TEST</strong><button type="button" onClick={() => setIsOpen(false)} className="rounded bg-slate-700 px-2 py-1 font-bold">閉じる</button></div>
    <p className="mb-2">直近50件・24時間以内・このタブの認証セッションだけ。端末内に記録し、自動送信しません。</p>
    <button type="button" onClick={() => void copy()} className="mb-2 rounded bg-emerald-700 px-3 py-2 font-bold">安全な診断情報をコピー</button>
    {copyStatus && <p role="status">{copyStatus}</p>}
    {copyText && <textarea aria-label="コピー用診断情報" readOnly value={copyText} onFocus={event => event.target.select()} className="my-2 h-32 w-full min-w-0 rounded bg-slate-900 p-2" />}
    <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">{rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-slate-400">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>
    <div className="mt-3 border-t border-slate-700 pt-2"><div className="mb-1 text-slate-400">local history ({history.length})</div><ol className="space-y-1">{history.map(entry => <li key={entry.id} className="break-all rounded bg-slate-900 px-2 py-1">{JSON.stringify(entry)}</li>)}</ol></div>
  </aside>;
};
