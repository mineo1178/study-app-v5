import { useEffect, useState } from 'react';
import { doc, getDocFromServer, onSnapshot, type Firestore } from 'firebase/firestore';
import { parseSchedule, scheduleDigest, type LearningSchedule } from './schedule';
import { scheduleRoot } from './schedule-repository';
export function useLearningSchedule(db:Firestore|null,family:string,uid:string,sample:boolean,active:()=>boolean){
 const key=JSON.stringify(['learning-schedule-v1',db?.app.options.projectId??'sample',family,uid,sample]);
 const [plan,setPlan]=useState<LearningSchedule|null>(()=>{try{const raw=localStorage.getItem(key);return raw?parseSchedule(raw):null;}catch{return null;}}),[loading,setLoading]=useState(!sample),[error,setError]=useState('');
 useEffect(()=>{
  if(sample||!db)return;let generation=0,live=true;
  const stop=onSnapshot(scheduleRoot(db,family,uid),snapshot=>{
   const request=++generation;
   if(!snapshot.exists()){if(snapshot.metadata.fromCache)return;if(live&&active()){setPlan(null);setLoading(false);setError('');try{localStorage.removeItem(key);}catch{/* Cloud remains authoritative. */}}return;}
   const p=snapshot.data();void getDocFromServer(doc(scheduleRoot(db,family,uid),'plans',p.versionId)).then(async saved=>{
    if(!saved.exists())throw new Error('保存済み計画が見つかりません。');const next=parseSchedule(JSON.stringify(saved.data().plan));
    if(next.planId!==p.planId||next.revision!==p.revision||await scheduleDigest(next)!==p.digest)throw new Error('保存済み計画の識別情報が一致しません。');
    if(live&&active()&&request===generation){setPlan(next);setError('');try{localStorage.setItem(key,JSON.stringify(next));}catch{/* The server copy still loads next time. */}}
   }).catch(e=>{if(live&&active()&&request===generation)setError((e as Error).message);}).finally(()=>{if(live&&active()&&request===generation)setLoading(false);});
  },()=>{if(live&&active()){setLoading(false);setError('計画を読み込めません。保存済みの端末表示があっても同期は未確認です。');}});
  return()=>{live=false;++generation;stop();};
 },[db,family,uid,sample,active,key]);
 function adopt(next:LearningSchedule){if(!active())throw new Error('利用者が切り替わりました。');setPlan(next);try{localStorage.setItem(key,JSON.stringify(next));setError('');}catch{setError('計画の取込は完了しましたが、端末へのキャッシュ保存はできませんでした。');}}
 return{plan,loading,error,adopt};
}
