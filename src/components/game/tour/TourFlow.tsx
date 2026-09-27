import { useState } from 'react';
import { getLeaderSkill } from '../../../game/leader-skills';
import type { ProducerGameState } from '../../../game/types';
import { TOUR_STOPS } from '../../../game/tour/config';
import { getBestTourRecommendation } from '../../../game/tour/recommendation';
import { canUnlockNationalTour, getCurrentTourStop, getNationalTourMissingConditions, getTourStopStatus, isNationalTourCompleted } from '../../../game/tour/progression';
import type { TourPerformanceResult } from '../../../game/tour/repository';
import { simulateTourPerformance } from '../../../game/tour/simulation';
import type { TourStopId } from '../../../game/tour/types';
import { TourEntryCard, TourHub, TourLegComplete, TourLiveSetup, TourResult } from '.';

type TourView = 'entry' | 'hub' | 'setup' | 'result';
const affinityHints: Record<TourStopId, string> = { 'tour-stop-1': '歌・ハモリが活きる！', 'tour-stop-2': 'ダンス曲と相性GOOD！', 'tour-stop-3': 'パフォーマンスがカギ！', 'tour-stop-4': 'メッセージ曲が活きる！', 'tour-stop-5': 'ダンスと演出がカギ！', 'tour-stop-6': '歌とキャラでファイナル！' };

export function TourFlow({ game, onSaveTour, onOpenFormation }: { game: ProducerGameState; onSaveTour: (stopId: TourStopId, songId: string) => Promise<TourPerformanceResult | null>; onOpenFormation: () => void }) {
  const [view, setView] = useState<TourView>('entry');
  const [selectedStopId, setSelectedStopId] = useState<TourStopId>('tour-stop-1');
  const [selectedSongId, setSelectedSongId] = useState('');
  const [result, setResult] = useState<TourPerformanceResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlocked = canUnlockNationalTour(game);
  const completedSongs = game.songs.filter((song) => song.status === 'completed');
  const activeMembers = (game.activeMemberIds ?? []).map((id) => game.members.find((member) => member.id === id)).filter((member): member is NonNullable<typeof member> => !!member);
  const leader = game.members.find((member) => member.id === game.leaderMemberId) ?? null;
  const safeSongId = completedSongs.some((song) => song.id === selectedSongId) ? selectedSongId : completedSongs[0]?.id ?? '';
  const prediction = view === 'setup' && safeSongId ? simulateTourPerformance(game, selectedStopId, safeSongId) : null;
  const recommendation = prediction ? getBestTourRecommendation(game, selectedStopId, safeSongId) : null;
  const remainingToClear = prediction ? Math.max(0, prediction.clearThreshold - prediction.audience) : undefined;
  const progress = game.tourProgress ?? { completedStopIds: [], soldOutStopIds: [], leg1Completed: false };
  const openSetup = (stopId: TourStopId) => { if (getTourStopStatus(game, stopId) === 'locked') return; setSelectedStopId(stopId); setSelectedSongId((current) => completedSongs.some((song) => song.id === current) ? current : completedSongs[0]?.id ?? ''); setError(null); setView('setup'); };
  const start = async () => { if (!safeSongId || !prediction || saving) return; setSaving(true); setError(null); try { const next = await onSaveTour(selectedStopId, safeSongId); if (!next) { setError('公演を保存できませんでした。もう一度試してね。'); return; } setResult(next); setView('result'); } catch { setError('公演を保存できませんでした。もう一度試してね。'); } finally { setSaving(false); } };
  if (view === 'hub') return <section className="space-y-3"><button type="button" onClick={() => setView('entry')} className="text-sm font-bold text-violet-700">← プロデュースへ戻る</button><TourHub stops={TOUR_STOPS.map((stop) => ({ stop, status: getTourStopStatus(game, stop.id), affinityHint: affinityHints[stop.id] }))} clearedCount={progress.completedStopIds.length} soldOutCount={progress.soldOutStopIds.length} onSelectStop={openSetup} /></section>;
  if (view === 'setup') { const stop = TOUR_STOPS.find((candidate) => candidate.id === selectedStopId)!; return <section className="space-y-3"><button type="button" onClick={() => setView('hub')} className="text-sm font-bold text-violet-700">← ツアー一覧へ戻る</button>{error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}<TourLiveSetup stop={stop} completedSongs={completedSongs} activeMembers={activeMembers} leader={leader} leaderSkillName={getLeaderSkill(game)?.name} selectedSongId={safeSongId} prediction={prediction} remainingToClear={remainingToClear} recommendations={recommendation ? [recommendation] : []} onSongChange={setSelectedSongId} onStart={start} onOpenFormation={onOpenFormation} /></section>; }
  if (view === 'result' && result) { const nextStop = getCurrentTourStop(result.game); const tourComplete = isNationalTourCompleted(result.game.tourProgress ?? progress); const leg1JustCompleted = result.performance.tourStopId === 'tour-stop-3' && result.performance.isClear; return <section className="space-y-3"><TourResult result={result.performance} remainingToClear={Math.max(0, (result.performance.clearThreshold ?? result.performance.capacity) - result.performance.audience)} firstClearReward={result.reward ? { fans: result.reward.fanBonus, activityPoints: result.reward.activityPointBonus } : null} nextStopLabel={tourComplete ? '全国ツアー完走！' : nextStop ? `${nextStop.city}公演 OPEN！` : leg1JustCompleted ? '5曲目とNOVA Stage 2をクリアしよう！' : undefined} />{(tourComplete || leg1JustCompleted) && <TourLegComplete fullTour={tourComplete} />}<button type="button" onClick={() => setView('hub')} className="w-full rounded-xl border border-violet-300 px-4 py-3 font-bold text-violet-700">ツアー一覧へ戻る</button></section>; }
  const status = isNationalTourCompleted(progress) ? 'complete' : unlocked ? 'open' : 'locked';
  return <TourEntryCard status={status} missing={getNationalTourMissingConditions(game)} onOpen={unlocked ? () => setView('hub') : undefined} />;
}
