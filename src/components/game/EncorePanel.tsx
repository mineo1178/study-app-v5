import { useEffect, useState } from "react";
import { deriveEncore, type EncoreContext } from "../../game/encore";

const messages: Record<string, string> = {
  math: "毎日のがんばりを、もう一曲に！", japanese: "続けてくれた気持ち、みんなに届けよう。",
  science: "練習の成果、最後まで見せるよ！", yuna: "みんなの声、ちゃんと届いてるよ！",
};
function useEncoreClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const at = Date.now();
      const midnight = (Math.floor((at + 32400000) / 86400000) + 1) * 86400000 - 32400000;
      timeout = setTimeout(refresh, Math.min(60000, Math.max(1, midnight - at)));
    };
    const refresh = () => { clearTimeout(timeout); setNow(Date.now()); schedule(); };
    schedule();
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(timeout); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return now;
}

function EncoreExperience({ context, now }: { context: EncoreContext; now: number }) {
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  useEffect(() => {
    if (phase !== "playing") return;
    const timeout = setTimeout(() => setPhase("done"), 8000);
    return () => clearTimeout(timeout);
  }, [phase]);
  const state = deriveEncore(context.game, context.tasks, now, context.timerRunning);
  const start = () => {
    if (phase === "playing" || context.status !== "ready" || !deriveEncore(context.game, context.tasks, Date.now(), context.timerRunning).eligible) return;
    setPhase("playing");
  };
  if (context.status !== "ready") return <p role="status">{context.status === "error" ? "読み取れないため、アンコールの達成判定ができません。通信を確認して、開き直してね。" : "保存済みの記録を確認中…"}</p>;
  if (!state.clear) return <p>🔒 東京ドームを成功させよう</p>;
  if (!state.songReady) return <p>「未来へのアンコール」を完成させよう</p>;
  if (state.members.length !== 4) return <p>加入済みの4人とリーダーを編成しよう</p>;
  return <div className="space-y-3 min-w-0">
    <p className="text-sm">今週 {Math.min(3, state.days.length)}／3日{state.days.length < 3 && ` ・ あと${3 - state.days.length}日`}</p>
    <p className="text-xs text-slate-600">1日10分以上の認定済み学習を、ちがう3日に。計算の時間は含まれないよ。</p>
    {state.running && <p role="status" className="text-sm text-amber-800">学習・計算タイマーを終えてからアンコールに応えよう</p>}
    {phase === "playing" && state.eligible ? <div role="status" aria-label="アンコール演出" className="space-y-3 rounded-xl bg-violet-50 p-3 motion-safe:animate-[pulse_2s_ease-in-out_1]">
      <p className="text-center font-black">👏 アンコール！ アンコール！</p>
      {state.members.map(member => <p key={member.id} className="break-words rounded-lg bg-white p-3 text-sm"><strong>{member.name}</strong><br />{messages[member.id] ?? "毎日のがんばり、もう一曲で届けよう！"}</p>)}
      <p className="text-center font-bold">🎵 未来へのアンコール</p>
      <button type="button" onClick={() => setPhase("done")} className="min-h-11 w-full rounded-xl border border-violet-400 px-3 py-2 font-bold">演出をスキップ・閉じる</button>
    </div> : <>
      {phase === "done" && state.eligible && <p role="status" className="rounded-xl bg-amber-50 p-3 font-bold">4人の想いが届いた！ 今週も学習を続けてくれてありがとう。</p>}
      <button type="button" disabled={!state.eligible} onClick={start} className="min-h-11 w-full rounded-xl bg-violet-600 px-3 py-3 font-black text-white disabled:bg-slate-300">{phase === "done" ? "もう一度見る" : "アンコールに応える"}</button>
    </>}
    <p className="text-xs text-slate-500">演出は何度でも楽しめるよ。活動Pやファンは増えません。</p>
  </div>;
}

export function EncorePanel(context: EncoreContext) {
  const now = useEncoreClock();
  const state = deriveEncore(context.game, context.tasks, now, context.timerRunning);
  const identity = [context.scope, context.status, state.weekId, state.eligible, state.clear, state.songReady,
    state.members.map(member => member.id).join(","), context.game.leaderMemberId].join(":");
  return <section aria-label="東京ドームのアンコール" className="min-w-0 border-t border-violet-200 pt-4">
    <h3 className="mb-3 font-black text-violet-800">アンコール</h3>
    <EncoreExperience key={identity} context={context} now={now} />
  </section>;
}
