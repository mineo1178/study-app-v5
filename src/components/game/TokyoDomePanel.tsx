import { hasArenaSongs } from "../../game/arena-progression";
import { useRef, useState } from "react";
import { canStartTokyoDomeLive, getTokyoDomeAction, isTokyoDomeChapterUnlocked, isTokyoDomeCompleted, TOKYO_DOME_LIVE, TOKYO_DOME_REQUIRED_FANS } from "../../game/tokyo-dome-progression";
import { simulateTokyoDomeLive, type TokyoDomeResult } from "../../game/tokyo-dome";
import { getActiveMembers } from "../../game/formation";
import { getLeaderSkill } from "../../game/leader-skills";
import { SONGS } from "../../game/config";
import type { ProducerGameState } from "../../game/types";

export function TokyoDomePanel({ game, onPerform, onOpenFormation }: { game: ProducerGameState; onPerform: (songId: string) => Promise<TokyoDomeResult | null>; onOpenFormation: () => void }) {
  const songs = game.songs.filter((song) => song.status === "completed" && SONGS.some((definition) => definition.id === song.id));
  const [songId, setSongId] = useState(songs[0]?.id ?? "");
  const [result, setResult] = useState<TokyoDomeResult | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const live = TOKYO_DOME_LIVE;
  const safeSongId = songs.some((song) => song.id === songId) ? songId : songs[0]?.id ?? "";
  const prediction = simulateTokyoDomeLive(game, safeSongId);
  const best = songs.map((song) => ({ song, simulation: simulateTokyoDomeLive(game, song.id) })).filter((item) => item.simulation && item.simulation.audience > (prediction?.audience ?? 0)).sort((a, b) => b.simulation!.audience - a.simulation!.audience)[0];
  const members = getActiveMembers(game);
  const skill = getLeaderSkill(game);
  const start = async () => {
    if (busy.current || !canStartTokyoDomeLive(game)) return;
    busy.current = true; setSaving(true); setError(null);
    try { const next = await onPerform(safeSongId); if (next) setResult(next); else setError("条件が変わったみたい。もう一度確認してね。"); }
    catch { setError("保存できませんでした。もう一度試してね。"); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section className="space-y-4 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
    <h2 className="text-xl font-black">東京ドーム</h2>
    <p className="text-sm">最後の大きな目標！ 条件をそろえて、夢のステージに挑戦しよう。</p>
    {isTokyoDomeCompleted(game) && <div className="rounded-xl bg-amber-50 p-4 text-center"><h3 className="text-xl font-black">夢のステージ達成！</h3><p>もっとアイドルを育てて、自己ベストを更新しよう！</p></div>}
    <>
      <div className="rounded-xl bg-amber-50 p-4"><h3 className="font-black">東京ドームまで</h3><p>{game.fans >= TOKYO_DOME_REQUIRED_FANS ? "✅" : "⬜"} ファン {game.fans.toLocaleString()} / {TOKYO_DOME_REQUIRED_FANS.toLocaleString()}</p><p>{hasArenaSongs(game) ? "✅" : "⬜"} 6曲完成</p><p>{members.length === 4 ? "✅" : "⬜"} 4人編成</p><p>{isTokyoDomeChapterUnlocked(game) ? "✅" : "⬜"} アリーナ成功</p><p className="mt-2 font-bold">{getTokyoDomeAction(game)}</p></div>
      <h3 className="font-black">{live.name}</h3><p className="text-sm">{live.capacity.toLocaleString()}席・CLEARライン {Math.ceil(live.capacity * live.clearRate).toLocaleString()}人</p>
      <label className="block text-sm font-bold">歌う曲<select className="mt-1 block w-full max-w-sm rounded-xl border px-3 py-2" value={safeSongId} disabled={saving} onChange={(event) => { setSongId(event.target.value); setResult(null); }}>{songs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</select></label>
      <div className="rounded-xl bg-slate-50 p-3 text-sm"><p>編成：{members.map((member) => member.name).join("・")}</p><p>Leader：{game.members.find((member) => member.id === game.leaderMemberId)?.name ?? "未設定"} {skill?.description}</p><button type="button" onClick={onOpenFormation} className="mt-2 rounded-lg border px-3 py-2 font-bold">編成を変える</button></div>
      {prediction && <div className="rounded-xl bg-amber-50 p-3"><p className="font-bold">予想観客 {prediction.audience.toLocaleString()}人</p><p>{prediction.isClear ? "CLEARできそう！" : `あと${(prediction.clearThreshold - prediction.audience).toLocaleString()}人`}</p><p className="text-sm">曲相性：{prediction.appliedAffinityPercent ? `+${prediction.appliedAffinityPercent}%` : "補正なし"}</p>{!prediction.isClear && <p className="mt-2 text-sm font-bold">{best ? `「${best.song.title}」に変えてみよう！` : "メンバーを育成して、曲とLeaderを選ぼう！"}</p>}</div>}
      <button type="button" className="w-full rounded-xl bg-amber-600 p-3 font-black text-white disabled:bg-slate-300" disabled={saving || !safeSongId || !canStartTokyoDomeLive(game)} onClick={start}>{saving ? "保存中…" : `${live.name}に挑戦！`}</button>
    </>
    {result?.reward && <div role="status" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-center"><h3 className="text-2xl font-black">夢のステージに立った！</h3><p className="mt-2">育てたアイドルたちと、東京ドームライブ成功！</p><p>でも活動はまだ続くよ。勉強とライブを楽しもう！</p></div>}
    {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
    {result && <div className="rounded-xl bg-amber-50 p-4 text-center"><p className="text-xl font-black">{result.performance.isClear ? "東京ドームライブ 大成功！" : "あと少し！ 曲や編成を見直してみよう！"}</p><p>{result.performance.audience.toLocaleString()} / {result.performance.capacity.toLocaleString()}人</p>{result.reward && <p className="font-bold">初回報酬：ファン +{result.reward.fanBonus.toLocaleString()}・活動P +{result.reward.activityPointBonus}</p>}</div>}
  </section>;
}
