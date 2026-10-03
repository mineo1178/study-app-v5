import { isArenaCompleted } from "../../game/arena-progression";
import { useState } from "react";
import { MAJOR_DEBUT_LIVE } from "../../game/config";
import { getActiveMembers } from "../../game/formation";
import { getLeaderSkill } from "../../game/leader-skills";
import { canStartMajorDebutLive, getGrowthRoadmap, isMajorDebutChapterUnlocked, isMajorDebutCompleted, simulateMajorDebutLive, type MajorDebutResult } from "../../game/major-debut";
import type { ProducerGameState } from "../../game/types";

export function MajorDebutPanel({ game, onPerform, onOpenFormation }: { game: ProducerGameState; onPerform: (songId: string) => Promise<MajorDebutResult | null>; onOpenFormation: () => void }) {
  const completedSongs = game.songs.filter((song) => song.status === "completed");
  const debutSong = completedSongs.find((song) => song.id === "beyond-the-dream");
  const [selectedSongId, setSelectedSongId] = useState(debutSong?.id ?? completedSongs[0]?.id ?? "");
  const [result, setResult] = useState<MajorDebutResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safeSongId = completedSongs.some((song) => song.id === selectedSongId) ? selectedSongId : debutSong?.id ?? completedSongs[0]?.id ?? "";
  const roadmap = getGrowthRoadmap(game);
  const tourComplete = roadmap.nationalTour === "complete";
  const chapterOpen = isMajorDebutChapterUnlocked(game);
  const arenaComplete = isArenaCompleted(game);
  const debutComplete = isMajorDebutCompleted(game);
  const activeMembers = getActiveMembers(game);
  const prediction = safeSongId ? simulateMajorDebutLive(game, safeSongId) : null;
  const bestAlternative = prediction ? completedSongs.map((song) => ({ song, simulation: simulateMajorDebutLive(game, song.id) })).filter((item) => item.simulation && item.simulation.audience > prediction.audience).sort((a, b) => b.simulation!.audience - a.simulation!.audience)[0] : null;
  const start = async () => { if (!safeSongId || saving || !canStartMajorDebutLive(game)) return; setSaving(true); setError(null); try { const next = await onPerform(safeSongId); if (!next) { setError("ライブを始められませんでした。条件を確認してね。"); return; } setResult(next); } catch { setError("保存できませんでした。もう一度試してね。"); } finally { setSaving(false); } };

  return <section className="space-y-4 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
    <div><h2 className="text-xl font-black">成長ロードマップ</h2><div className="mt-3 grid gap-2 text-sm font-bold sm:grid-cols-4"><p className={`rounded-xl p-3 ${tourComplete ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>全国ツアー {tourComplete ? "✅" : "← NOW"}</p><p className={`rounded-xl p-3 ${debutComplete ? "bg-emerald-50 text-emerald-700" : chapterOpen ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}>メジャーデビュー {debutComplete ? "✅" : chapterOpen ? "← NOW" : "🔒"}</p><p className={`rounded-xl p-3 ${debutComplete ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>アリーナ {arenaComplete ? "✅" : debutComplete ? "← NOW" : "🔒"}</p><p className="rounded-xl bg-slate-100 p-3 text-slate-500">東京ドーム {roadmap.tokyoDome === "complete" ? "✅" : arenaComplete ? "← NOW" : "🔒"}</p></div></div>
    {chapterOpen && !debutComplete && <div className="rounded-2xl bg-sky-50 p-4"><h3 className="font-black text-sky-900">メジャーデビューまで</h3><p className="mt-2 text-sm">{debutSong ? "✅" : "⬜"} 夢のその先へ</p><p className="text-sm">{game.fans >= MAJOR_DEBUT_LIVE.requiredFans ? "✅" : "⬜"} ファン {game.fans.toLocaleString()} / {MAJOR_DEBUT_LIVE.requiredFans.toLocaleString()}</p><p className="text-sm">{activeMembers.length === 4 ? "✅" : "⬜"} 4人編成</p></div>}
    {chapterOpen && <><div><h3 className="font-black">メジャーデビューライブ</h3><p className="text-sm text-slate-600">10,000席・CLEARライン {prediction?.clearThreshold.toLocaleString() ?? "9,000"}人</p></div><label className="block text-sm font-bold">歌う曲<select value={safeSongId} onChange={(event) => { setSelectedSongId(event.target.value); setResult(null); }} className="mt-1 block w-full max-w-sm rounded-xl border border-sky-300 bg-white px-3 py-2">{completedSongs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</select></label><div className="rounded-xl bg-slate-50 p-3 text-sm"><p><b>編成</b> {activeMembers.map((member) => member.name).join("・") || "未設定"}</p><p><b>Leader</b> {game.members.find((member) => member.id === game.leaderMemberId)?.name ?? "未設定"}{getLeaderSkill(game) ? `（${getLeaderSkill(game)!.name}）` : ""}</p><button type="button" onClick={onOpenFormation} className="mt-2 rounded-lg border border-sky-300 px-3 py-2 font-bold text-sky-700">編成を変える</button></div>{prediction && <div className="rounded-xl bg-sky-50 p-3"><p className="text-sm font-bold">予想観客</p><p className="text-2xl font-black">{prediction.audience.toLocaleString()}人</p><p className="text-sm font-bold text-sky-800">{prediction.isClear ? "CLEARできそう！" : `あと${Math.max(0, prediction.clearThreshold - prediction.audience).toLocaleString()}人`}</p></div>}<button type="button" disabled={!canStartMajorDebutLive(game) || saving} onClick={start} className="w-full rounded-xl bg-sky-600 px-5 py-3 font-black text-white disabled:bg-slate-300">{saving ? "保存中…" : "メジャーデビューライブに挑戦！"}</button></>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
    {result && <div className={`rounded-2xl p-4 text-center ${result.performance.isClear ? "bg-amber-50" : "bg-slate-100"}`}><p className="text-2xl font-black">{result.performance.isClear ? "メジャーデビュー成功！" : "あと少し！"}</p><p className="mt-1">{result.performance.audience.toLocaleString()} / {result.performance.capacity.toLocaleString()}人</p>{result.reward && <p className="mt-2 font-bold">初回報酬：ファン +{result.reward.fanBonus.toLocaleString()}・活動P +{result.reward.activityPointBonus}</p>}{!result.performance.isClear && <p className="mt-2 text-sm font-bold text-sky-800">{bestAlternative ? `「${bestAlternative.song.title}」に変えてみよう！` : "Leaderを変えるか、もっと育成しよう！"}</p>}</div>}
    {debutComplete && <div className="rounded-2xl bg-amber-50 p-5 text-center"><h3 className="text-xl font-black text-amber-800">メジャーデビュー成功！</h3><p className="mt-2 font-bold">{roadmap.tokyoDome === "complete" ? "夢のステージ達成！" : arenaComplete ? "次の目標：東京ドーム！" : "次の目標：アリーナライブ！"}</p>{roadmap.tokyoDome !== "complete" && <p className="mt-1 text-sm">その先には東京ドームが待っている！</p>}</div>}
  </section>;
}
