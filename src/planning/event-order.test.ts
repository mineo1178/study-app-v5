import {it,expect} from 'vitest';
import {compareEventPriority,eventTone} from './event-order';
import {DEFAULT_CALENDAR} from './events';
it('prioritizes placement then karite then lessons and retains every same-day event',()=>{
 const rows=(['lesson','other','karite','placement'] as const).map((kind,i)=>({...DEFAULT_CALENDAR.events[0],eventId:String(i),kind}));const before=JSON.stringify(rows),sorted=[...rows].sort(compareEventPriority);expect(sorted.map(e=>e.kind)).toEqual(['placement','karite','lesson','other']);expect(sorted.map(eventTone)).toEqual(['important','karite','lesson','other']);expect(sorted).toHaveLength(4);expect(JSON.stringify(rows)).toBe(before);expect(eventTone({...rows[1],name:'志望校判定テスト②'})).toBe('important');
});
