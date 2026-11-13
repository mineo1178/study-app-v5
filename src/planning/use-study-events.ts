import {useMemo,useSyncExternalStore} from 'react';
import {emptyEventStore,parseEventStore,prepareEventImport} from './events';

const changed='study-events-updated';
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener(changed,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(changed,callback);};}
export function useStudyEvents(scope:string,active:()=>boolean){
 const key='learning-events-v1:'+scope;
 const raw=useSyncExternalStore(subscribe,()=>{try{return localStorage.getItem(key);}catch{return 'unavailable';}},()=>null);
 const result=useMemo(()=>{try{return{store:raw?parseEventStore(raw):emptyEventStore(),error:''};}catch{return{store:emptyEventStore(),error:'端末のイベント参照を読み取れません。元のJSONを確認してください。'};}},[raw]);
 function preview(input:string,capacities:Record<string,number>){if(!active()||result.error)throw Error(result.error||'利用者が切り替わりました。');return prepareEventImport(input,result.store,capacities,new Date().toISOString());}
 function save(input:string,capacities:Record<string,number>,expected:string|null){if(!active())throw Error('利用者が切り替わりました。');if(localStorage.getItem(key)!==expected)throw Error('別画面でイベントが更新されています。選び直してください。');const next=preview(input,capacities);localStorage.setItem(key,JSON.stringify(next.store));window.dispatchEvent(new Event(changed));return next;}
 return{...result,raw,preview,save};
}
