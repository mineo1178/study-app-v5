import {useMemo,useSyncExternalStore} from 'react';
import type {Firestore} from 'firebase/firestore';
import {currentBinding,nextBinding,projectBinding,readBinding} from './material-binding';
import {saveMaterialBinding} from './material-binding-repository';
import type {PlanningTask} from './model';

const event='material-bindings-changed';
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener(event,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(event,callback);};}
export const bindingStorageKey=(project:string,family:string,uid:string)=>JSON.stringify(['sample-material-bindings-v1',project,family,uid]);
function parseLocal(raw:string|null){try{const value=JSON.parse(raw??'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export function useMaterialBindings(db:Firestore|null,family:string,uid:string,sample:boolean,active:()=>boolean,tasks:PlanningTask[]){
 const key=bindingStorageKey(db?.app.options.projectId??'sample',family,uid);
 const raw=useSyncExternalStore(subscribe,()=>{if(!sample)return null;try{return localStorage.getItem(key);}catch{return 'unavailable';}},()=>null);
 const local=useMemo(()=>parseLocal(raw),[raw]);
 const projected=useMemo(()=>tasks.map(t=>projectBinding(t,sample?readBinding(local[t.id],uid):currentBinding(t,uid))),[tasks,sample,local,uid]);
 const record=(t:PlanningTask)=>sample?readBinding(local[t.id],uid):currentBinding(t,uid);
 async function save(task:PlanningTask,expectedRevision:number,materialId:string|null){
  if(!active())throw Error('利用者が切り替わりました。');
  if(!sample){if(!db)throw Error('接続を確認してください。');return saveMaterialBinding(db,family,uid,task,expectedRevision,materialId,active);}
  const latest=parseLocal(localStorage.getItem(key));
  const next=nextBinding(task,uid,readBinding(latest[task.id],uid),expectedRevision,materialId);
  localStorage.setItem(key,JSON.stringify({...latest,[task.id]:next}));window.dispatchEvent(new Event(event));return next;
 }
 return {tasks:projected,record,save};
}
