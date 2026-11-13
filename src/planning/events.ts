import {addDays,validDay} from './model';
import type {PlanningTask} from './model';

export type StudyEvent={eventId:string;kind:'karite'|'placement'|'lesson'|'special'|'other'|'closure';name:string;label:string;day:string;rounds:string[];source:string;confirmed:boolean;updatedAt:string;nextLessonFor?:string[];cancelled?:boolean};
export type RoundDeadline={unit:string;day:string;source:string;confirmed:boolean;updatedAt:string};
export type EventCalendar={schemaVersion:'learning-events/1';calendarId:string;revision:number;generatedAt:string;events:StudyEvent[];deadlines:RoundDeadline[]};
export type DeadlineResult={unit:string;day:string|null;confirmed:boolean;basis:string;eventId?:string};
export type DeadlineChange={unit:string;before:DeadlineResult;after:DeadlineResult;changedAt:string};
export type EventStore={calendar:EventCalendar;history:DeadlineChange[];ledger:Record<string,{revision:number;content:string}>};
// Only facts explicitly confirmed in the user's release requirements are bundled.
// Full local timetables and evidence files stay private and are imported per account.
const checkedAt='2026-11-14T00:00:00+09:00',confirmedSource='v1.89.19依頼で確認済みの予定表・期限';
export const DEFAULT_CALENDAR:EventCalendar={schemaVersion:'learning-events/1',calendarId:'confirmed-calendar-2026',revision:1,generatedAt:checkedAt,events:[{eventId:'karite-20261121-11-12',kind:'karite',name:'カリキュラムテスト 第11回・第12回',label:'カリテ11・12回',day:'2026-11-21',rounds:['第11回','第12回'],source:confirmedSource,confirmed:true,updatedAt:checkedAt}],deadlines:[{unit:'第11回',day:'2026-11-12',source:confirmedSource,confirmed:true,updatedAt:checkedAt},{unit:'第12回',day:'2026-11-19',source:confirmedSource,confirmed:true,updatedAt:checkedAt}]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=300):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const date=(v:unknown):v is string=>typeof v==='string'&&validDay(v);
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
const units=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=30&&new Set(v).size===v.length&&v.every(s=>text(s,30)&&/^第[0-9０-９]+回$/.test(s));
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
const canonical=(value:unknown):string=>JSON.stringify(value,(_k,v)=>object(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const naturalKey=(e:StudyEvent)=>[e.kind,e.day,[...e.rounds].sort().join(','),e.kind==='lesson'||e.kind==='special'?e.name:''].join('|');
export function parseEventCalendar(raw:string):EventCalendar{
 if(new TextEncoder().encode(raw).length>150000)throw Error('イベントファイルは150KBまでです。');
 let p:unknown;try{p=JSON.parse(raw);}catch{throw Error('イベントJSONの構文を確認してください。');}
 if(!object(p)||!keys(p,['schemaVersion','calendarId','revision','generatedAt','events','deadlines'])||p.schemaVersion!=='learning-events/1'||!id(p.calendarId)||!Number.isSafeInteger(p.revision)||Number(p.revision)<1||Number(p.revision)>1000000||!time(p.generatedAt)||!Array.isArray(p.events)||p.events.length>300||!Array.isArray(p.deadlines)||p.deadlines.length>30)throw Error('イベントの形式・revisionを確認してください。');
 const ids=new Set<string>(),natural=new Set<string>();
 for(const e of p.events){
  if(!object(e)||!keys(e,['eventId','kind','name','label','day','rounds','source','confirmed','updatedAt','nextLessonFor','cancelled'])||!id(e.eventId)||!['karite','placement','lesson','special','other','closure'].includes(String(e.kind))||!text(e.name)||!text(e.label,60)||!date(e.day)||!units(e.rounds)||!text(e.source,600)||e.confirmed!==true||!time(e.updatedAt)||(e.cancelled!==undefined&&typeof e.cancelled!=='boolean')||(e.nextLessonFor!==undefined&&(!units(e.nextLessonFor)||e.kind!=='lesson')))throw Error('正式予定表で確認したイベント・日付・対象回・出典を指定してください。');
  const key=naturalKey(e as StudyEvent);if(ids.has(e.eventId)||natural.has(key))throw Error('イベントIDまたは日付・種別・対象回が重複しています。');ids.add(e.eventId);natural.add(key);
 }
 const rounds=new Set<string>();
 for(const d of p.deadlines){if(!object(d)||!keys(d,['unit','day','source','confirmed','updatedAt'])||!units([d.unit])||!date(d.day)||!text(d.source,600)||d.confirmed!==true||!time(d.updatedAt)||rounds.has(String(d.unit)))throw Error('確認済み完了期限・出典・対象回を指定してください。');rounds.add(String(d.unit));}
 return p as EventCalendar;
}
export function visibleEvents(calendar:EventCalendar){return calendar.events.filter(e=>e.confirmed&&!e.cancelled).sort((a,b)=>a.day.localeCompare(b.day)||a.eventId.localeCompare(b.eventId));}
export function automaticDeadline(unit:string,calendar:EventCalendar,capacities:Record<string,number>={}):DeadlineResult{
 const explicit=calendar.deadlines.find(d=>d.unit===unit&&d.confirmed);
 if(explicit)return{unit,day:explicit.day,confirmed:true,basis:'明示完了期限：'+explicit.source};
 const events=visibleEvents(calendar),lesson=events.find(e=>e.kind==='lesson'&&e.nextLessonFor?.includes(unit));
 if(lesson)return{unit,day:addDays(lesson.day,-1),confirmed:true,basis:'確定した次回授業の前日：'+lesson.source,eventId:lesson.eventId};
 const test=events.find(e=>['karite','placement'].includes(e.kind)&&e.rounds.includes(unit)),available=test?Object.keys(capacities).filter(d=>validDay(d)&&d<test.day&&capacities[d]>0).sort().at(-1):null;
 return{unit,day:available??null,confirmed:false,basis:available?'テスト前の学習可能日による仮案（未採用）':'完了期限の根拠未確認',...(test?{eventId:test.eventId}:{})};
}
export function emptyEventStore():EventStore{return{calendar:structuredClone(DEFAULT_CALENDAR),history:[],ledger:{}};}
export function parseEventStore(raw:string):EventStore{
 const p:unknown=JSON.parse(raw);
 const result=(d:unknown)=>object(d)&&units([d.unit])&&(d.day===null||date(d.day))&&typeof d.confirmed==='boolean'&&text(d.basis,1000);
 if(!object(p)||!Array.isArray(p.history)||p.history.length>1000||p.history.some(h=>!object(h)||!units([h.unit])||!result(h.before)||!result(h.after)||!time(h.changedAt))||!object(p.ledger)||Object.entries(p.ledger).some(([key,v])=>!id(key)||!object(v)||!Number.isSafeInteger(v.revision)||Number(v.revision)<1||typeof v.content!=='string'))throw Error('イベント履歴の形式を確認してください。');
 parseEventCalendar(JSON.stringify(p.calendar));return p as EventStore;
}
export function prepareEventImport(raw:string,store:EventStore,capacities:Record<string,number>,now:string){
 const incoming=parseEventCalendar(raw),content=canonical(incoming),old=store.ledger[incoming.calendarId];
 if(incoming.deadlines.some(d=>DEFAULT_CALENDAR.deadlines.some(fixed=>d.unit===fixed.unit&&d.day!==fixed.day)))throw Error('第11回11/12・第12回11/19の確定完了期限はイベント取込で延長できません。');
 if(old&&(incoming.revision<old.revision||incoming.revision===old.revision&&content!==old.content))throw Error('旧revisionまたは同じrevisionの内容変更です。revisionを更新してください。');
 const eventChanges:{name:string;before:string|null;after:string|null;rounds:string[]}[]=[];
 if(old?.content===content)return{store,changes:[] as DeadlineChange[],eventChanges,added:0,changed:0,duplicate:true};
 const events=[...store.calendar.events],deadlines=[...store.calendar.deadlines];let added=0,changed=0;
 for(const event of incoming.events){const index=events.findIndex(e=>e.eventId===event.eventId||naturalKey(e)===naturalKey(event));if(index<0){events.push(event);added++;eventChanges.push({name:event.name,before:null,after:event.cancelled?null:event.day,rounds:event.rounds});}else if(canonical(events[index])!==canonical({...event,eventId:events[index].eventId})){if(Date.parse(event.updatedAt)<Date.parse(events[index].updatedAt))throw Error('イベントの更新日時が既存より古いため停止しました。');eventChanges.push({name:event.name,before:events[index].cancelled?null:events[index].day,after:event.cancelled?null:event.day,rounds:event.rounds});events[index]={...event,eventId:events[index].eventId};changed++;}}
 for(const deadline of incoming.deadlines){const index=deadlines.findIndex(d=>d.unit===deadline.unit);if(index<0)deadlines.push(deadline);else{if(Date.parse(deadline.updatedAt)<Date.parse(deadlines[index].updatedAt))throw Error('完了期限の更新日時が既存より古いため停止しました。');deadlines[index]=deadline;}}
 const calendar=parseEventCalendar(JSON.stringify({...incoming,events,deadlines}));
 const rounds=[...new Set([...deadlines.map(d=>d.unit),...events.flatMap(e=>[...e.rounds,...e.nextLessonFor??[]])])];
 const changes=rounds.flatMap(unit=>{const before=automaticDeadline(unit,store.calendar,capacities),after=automaticDeadline(unit,calendar,capacities);return canonical(before)===canonical(after)?[]:[{unit,before,after,changedAt:now}];});
 return{store:{calendar,history:[...store.history,...changes],ledger:{...store.ledger,[incoming.calendarId]:{revision:incoming.revision,content}}},changes,eventChanges,added,changed,duplicate:false};
}
export function automaticOverdue(tasks:PlanningTask[],calendar:EventCalendar,history:DeadlineChange[],today:string){
 return [...new Map(tasks.map(t=>[t.id,t])).values()].filter(t=>t.status!=='completed'&&[automaticDeadline(t.unit,calendar),...history.filter(h=>h.unit===t.unit).map(h=>h.before)].some(d=>d.confirmed&&d.day!==null&&d.day<today));
}
