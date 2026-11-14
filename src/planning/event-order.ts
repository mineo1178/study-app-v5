import type {StudyEvent} from './events';

export function eventTone(event:StudyEvent){return (event.kind==='placement'||event.kind==='other'&&/判定テスト|重要テスト|重要試験/.test(event.name+' '+event.label))?'important':event.kind==='karite'?'karite':event.kind==='lesson'||event.kind==='special'?'lesson':'other';}
export function compareEventPriority(a:StudyEvent,b:StudyEvent){
 const rank={important:0,karite:1,lesson:2,other:3};return rank[eventTone(a)]-rank[eventTone(b)]||a.eventId.localeCompare(b.eventId);
}
