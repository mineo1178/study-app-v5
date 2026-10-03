import { useEffect, useMemo, useState } from "react";
import { getElapsedSeconds } from "../study-utils";
import { shortenDeviceTestId, type DeviceTestEvent } from "../device-test";

type DiagnosticTask = {
  id: string;
  currentDuration: number;
  sessionStartTime: number | null;
  sessionId?: string;
  isRunning: boolean;
  lastUpdatedAt: number;
};

const formatTimestamp = (value?: number | null) =>
  value
    ? new Date(value).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "-";

const formatElapsed = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
};

export const DeviceTestPanel = ({
  tasks,
  syncState,
  lastSync,
  online,
  visibility,
  retryQueueCount,
  activeStudyTaskId,
  activeStudyTaskError,
  restoreState,
  history,
}: {
  tasks: DiagnosticTask[];
  syncState: "synced" | "syncing" | "offline";
  lastSync: string;
  online: boolean;
  visibility: DocumentVisibilityState;
  retryQueueCount: number;
  activeStudyTaskId: string | null | undefined;
  activeStudyTaskError: boolean;
  restoreState: string;
  history: DeviceTestEvent[];
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const task = useMemo(() => {
    const running = tasks.find((item) => item.isRunning && item.sessionStartTime !== null);
    if (running) return running;
    return [...tasks]
      .filter((item) => item.currentDuration > 0)
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)[0];
  }, [tasks]);
  const timerState = task?.isRunning ? "running" : task ? "paused" : "idle";
  const localActiveId = task?.isRunning ? task.id : null;
  const activeMatch = activeStudyTaskError
    ? "read error"
    : activeStudyTaskId === undefined
      ? "loading"
      : localActiveId === activeStudyTaskId
        ? "match"
        : "MISMATCH";

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed top-2 left-2 z-[70] rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-xl"
      >
        端末診断
      </button>
    );
  }

  const rows = [
    ["timer", timerState],
    ["taskId", shortenDeviceTestId(task?.id)],
    ["sessionId", shortenDeviceTestId(task?.sessionId)],
    ["start", formatTimestamp(task?.sessionStartTime)],
    ["elapsed", task ? formatElapsed(getElapsedSeconds(task, now)) : "00:00:00"],
    ["network", online ? "online" : "offline"],
    ["sync", syncState],
    ["visibility", visibility],
    ["retry queue", String(retryQueueCount)],
    ["last sync", lastSync],
    ["cloud active", shortenDeviceTestId(activeStudyTaskId)],
    ["active match", activeMatch],
    ["restore", restoreState],
  ];

  return (
    <aside className="fixed inset-x-2 top-2 z-[70] mx-auto max-h-[72vh] max-w-lg overflow-y-auto rounded-xl border border-emerald-400 bg-slate-950/95 p-3 font-mono text-[11px] text-slate-100 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <strong className="text-emerald-300">v1.84 DEVICE TEST</strong>
        <button type="button" onClick={() => setIsOpen(false)} className="rounded bg-slate-700 px-2 py-1 font-bold">
          閉じる
        </button>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-400">{label}</dt>
            <dd className={value === "MISMATCH" || value === "read error" ? "font-bold text-red-300" : "break-all"}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-slate-700 pt-2">
        <div className="mb-1 text-slate-400">local history ({history.length})</div>
        {history.length === 0 ? (
          <div className="text-slate-500">no events</div>
        ) : (
          <ol className="space-y-1">
            {history.map((entry) => (
              <li key={entry.id} className="rounded bg-slate-900 px-2 py-1">
                <span className="text-slate-400">{formatTimestamp(entry.at)}</span>{" "}
                <strong className="text-emerald-300">{entry.type}</strong>{" "}
                <span>task={shortenDeviceTestId(entry.taskId)} session={shortenDeviceTestId(entry.sessionId)}</span>
                {entry.detail ? <span className="text-slate-400"> {entry.detail}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
};
