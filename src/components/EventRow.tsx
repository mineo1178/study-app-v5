import {compareEventPriority,eventTone} from '../planning/event-order';
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {automaticDeadline,visibleEvents,type EventCalendar} from '../planning/events';

export function EventRow({calendar,days,today}:{calendar:EventCalendar;days:string[];today:string}){
 const [selected,setSelected]=useState<string|null>(null),events=visibleEvents(calendar),picked=events.filter(e=>e.day===selected);
 return <><div className="sheet-row sheet-event-row" role="row" data-event-row>
  <div className="sheet-name" role="rowheader">イベント</div><div className="sheet-number wbs-progress" role="cell"><small>予定表</small></div>
  <div className="sheet-event-days" role="cell">{days.map(day=>{const list=events.filter(e=>e.day===day).sort(compareEventPriority);return <div key={day} data-event-day={day} className={'sheet-event-day '+(day===today?'sheet-today':'')}>{list.length>0&&<button className={'event-tone-'+eventTone(list[0])} title={list.map(e=>e.name).join('／')} aria-label={day+'のイベント：'+list.map(e=>e.label).join('・')} onClick={()=>setSelected(day)}><span>{list[0].label}</span>{list.length>1&&<small> ＋{list.length-1}件</small>}</button>}</div>;})}</div>
 </div>{selected&&createPortal(<div className="wbs-overlay"><section className="wbs-editor event-details" role="dialog" aria-modal="true" aria-label="イベントの詳細" onKeyDown={e=>{if(e.key==='Escape')setSelected(null);}}><header><h3>{selected} のイベント</h3><button autoFocus onClick={()=>setSelected(null)}>閉じる</button></header>{picked.map(event=><article key={event.eventId}><strong>{event.name}</strong><p>実施日：{event.day} ／ 対象：{event.rounds.join('・')||'回の指定なし'}</p><p>確認済み ／ 出典：{event.source}</p>{event.rounds.map(unit=>{const deadline=automaticDeadline(unit,calendar);return <p key={unit}>{unit} 完了期限：{deadline.day??'未設定'}{deadline.day&&!deadline.confirmed?'（仮案）':''}</p>;})}<small>更新：{event.updatedAt}</small></article>)}<p>完了期限は演習・採点・必要な直し・最終確認までの目標です。採用済み計画・手動予定・固定目標とは別です。</p></section></div>,document.body)}</>;
}
