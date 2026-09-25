import type { TourStopDefinition, TourStopStatus } from '../../../game/tour/types';
import { TourProgress } from './TourProgress';
import { TourStopCard } from './TourStopCard';

export type TourHubStop = { stop: TourStopDefinition; status: TourStopStatus; affinityHint: string; latestAudience?: number };
export function TourHub({ stops, clearedCount, soldOutCount, onSelectStop }: { stops: TourHubStop[]; clearedCount: number; soldOutCount?: number; onSelectStop?: (stopId: TourStopDefinition['id']) => void }) { return <section className="space-y-4"><div><h2 className="text-xl font-black">全国ツアー</h2><p className="text-sm text-slate-600">Tour Leg 1・3公演</p></div><TourProgress cleared={clearedCount} soldOut={soldOutCount} /><div className="grid gap-3 sm:grid-cols-3">{stops.map((item) => <TourStopCard key={item.stop.id} {...item} onSelect={onSelectStop ? () => onSelectStop(item.stop.id) : undefined} />)}</div></section>; }
