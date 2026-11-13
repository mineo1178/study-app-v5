import {prepareScheduleFile} from '../planning/import-file';
import {referencePlan,referenceSummary} from '../planning/schedule-reference';
import {referenceChanges,planIdentity} from '../planning/schedule-view';
import {OfficialSchedulePreview} from './OfficialSchedulePreview';
import {exportScheduleFeedback,readOfficialFile} from '../planning/official-schedule';
import type {OfficialPlan,ProposalResolution} from '../planning/official-schema';
import {useEffect,useRef,useState,type ChangeEvent,type RefObject} from 'react';
import {canonical,materialKey,parseSchedule,scheduleDiff,scheduleErrors,stageImportConflicts,type LearningSchedule} from '../planning/schedule';
import type {PlanningTask} from '../planning/model';
import {downloadJson} from '../planning/download-json';
export function ScheduleImport({current,tasks,binding,busy,active,onImport,onShowGantt,autoSave=false,inputRef,onResult}:{current:LearningSchedule|null;tasks:PlanningTask[];binding:string;busy:boolean;active:()=>boolean;onImport:(plan:LearningSchedule)=>Promise<void>;onShowGantt?:()=>void;autoSave?:boolean;inputRef?:RefObject<HTMLInputElement|null>;onResult?:(message:string,failed:boolean)=>void}){
 const [official,setOfficial]=useState<{source:OfficialPlan;records?:ProposalResolution[]}|null>(null),[preview,setPreview]=useState<LearningSchedule|null>(null);
 const [error,setError]=useState(''),[confirmed,setConfirmed]=useState(false),[notice,setNotice]=useState(''),[referenceOnly,setReferenceOnly]=useState(false),[filename,setFilename]=useState('');
 const generation=useRef(0),ownInput=useRef<HTMLInputElement>(null),saving=useRef(false);
 const input=inputRef??ownInput;
 useEffect(()=>()=>{++generation.current;},[]);
 const errors=preview?[...scheduleErrors(preview,tasks,binding),...stageImportConflicts(preview,current)]:[],diff=preview?scheduleDiff(preview,current):null,changes=preview?referenceChanges(current,preview):null;
 const same=!!preview&&current?.planId===preview.planId&&current.revision===preview.revision,identical=same&&canonical(current)===canonical(preview);
 const revisionError=same&&!identical?'同じrevisionの内容が変わっています。ローカルでrevisionを増やしてください。':preview&&current?.planId===preview.planId&&preview.revision<current.revision?'旧revisionは取り込めません。':'';
 const identity=planIdentity(current),refs=preview?(preview.proposalImport?referenceSummary(tasks,preview,'0001-01-01','9999-12-31'):{provided:preview.items.length,matched:preview.items.filter(i=>tasks.some(t=>t.id===i.taskId)).length,unmatched:0}):null;
 async function choose(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0],request=++generation.current;if(!f)return;setFilename(f.name);setError('');setPreview(null);setOfficial(null);setConfirmed(false);setNotice('');try{
  if(f.size>150000)throw new Error('計画ファイルは150KBまでです。');const raw=await f.text(),v=JSON.parse(raw);if(!active()||request!==generation.current)return;
  if(autoSave){
   if(saving.current)throw Error('計画を保存中です。');
   const prepared=prepareScheduleFile(raw,tasks,current,binding);
   setPreview(prepared.plan);setReferenceOnly(prepared.referenceOnly);
   saving.current=true;
   try{await onImport(prepared.plan);}finally{saving.current=false;}
   if(active()&&request===generation.current){
    const message=prepared.duplicate?'同じ計画を確認しました・保存済み':prepared.referenceOnly?'参照計画の更新完了':'計画更新完了：'+prepared.scheduledCount+'課題の予定を反映';
    setNotice(message);onResult?.(message,false);onShowGantt?.();
   }
   return;
  }
  if(v.schemaVersion==='learning-schedule/1'){const plan=parseSchedule(raw);if(plan.accountBinding&&plan.accountBinding!==binding)throw new Error('計画のアカウント識別子が現在の認証アカウントと一致しません。');if(plan.proposalImport){setOfficial({source:plan.proposalImport.source,records:plan.proposalImport.records});if(plan.items.some(i=>i.stages?.length)){setPreview(plan);setReferenceOnly(false);}else{setPreview(referencePlan(plan.proposalImport.source,tasks,current,binding));setReferenceOnly(true);}}else{setPreview(plan);setReferenceOnly(false);}}
  else{const data=readOfficialFile(raw,binding);setOfficial(data);setPreview(referencePlan(data.source,tasks,current,binding));setReferenceOnly(true);}
 }catch(err){if(active()&&request===generation.current){setPreview(null);setOfficial(null);setError((err as Error).message);onResult?.((err as Error).message,true);}}finally{if(input.current)input.current.value='';}}
 async function save(){if(saving.current||!preview||!active())return;saving.current=true;setError('');setNotice('');try{await onImport(preview);if(active()){setNotice(referenceOnly?'参照予定を保存しました':'採用設定を保存しました');setConfirmed(false);}}catch(err){if(active())setError((err as Error).message);}finally{saving.current=false;}}
 const blocked=busy||!!errors.length||!!revisionError||identical;
 return <section id="schedule-import" className="plan-import" aria-label="学習計画の取込">
 <section className="plan-step"><h3><span>STEP 1</span> ファイル選択</h3><input ref={input} hidden aria-label="学習計画JSON" type="file" accept="application/json,.json" disabled={busy||!binding||!tasks.length} onChange={e=>void choose(e)}/><button className="plan-primary" disabled={busy||!binding||!tasks.length} onClick={()=>input.current?.click()}>計画ファイルを選ぶ</button><p className="plan-filename">{filename||'ファイル未選択'}</p>{error&&<p role="alert">{error}</p>}</section>
 {preview&&changes&&refs&&<><section className="plan-step" aria-label="学習計画の取込プレビュー"><h3><span>STEP 2</span> 差分確認</h3><div className="plan-revisions"><div><small>現在の参照</small><strong>{identity.revision===null?'未登録':'資料 r'+identity.revision+' ／ アプリ r'+identity.appRevision}</strong><code>{identity.planId??'—'}</code></div><div><small>選択した計画</small><strong>資料 r{changes.after.revision} ／ アプリ r{changes.after.appRevision}</strong><code>{changes.after.planId}</code></div></div>
 {!changes.sameId&&identity.planId&&<p>異なる計画IDです。revisionの数字では新旧を比較しません。</p>}
 <dl className="plan-facts"><div><dt>対象回</dt><dd>{preview.scope.map(s=>s.unit).join('・')}</dd></div><div><dt>計画</dt><dd>{preview.provisional?'仮計画':'確定計画'}</dd></div><div><dt>工程案</dt><dd>{refs.provided}件</dd></div><div><dt>taskId対応</dt><dd>{refs.matched}件</dd></div><div><dt>不一致・未表示</dt><dd>{errors.length+refs.unmatched}件</dd></div><div><dt>容量超過</dt><dd>{String(preview.proposalImport?.source.planningPolicy.feasibilityStatus??'').includes('capacity_exceeded')?'あり':'未確認'}</dd></div></dl>
 <p>工程案の差分：追加 {changes.added}件・変更 {changes.changed}件・除外 {changes.removed}件・変更なし {changes.unchanged}件</p><p>正式教材提案 {preview.proposalImport?.source.taskProposals.length??0}件は、既存taskIdの工程案とは別です。</p>
 {identical&&<p role="status">同一revision・同一内容のため再保存は不要です。</p>}{revisionError&&<p role="alert">{revisionError}</p>}{errors.map((x,i)=><p role="alert" key={i}>{x}</p>)}
 {!referenceOnly&&<p>採用設定を含む形式です。採用は下の詳細設定で確認してください。工程参照には正式JSONを選択します。</p>}
 <details><summary>差分・未確認事項の詳細</summary><p>採用済み予定：追加 {diff?.added}・変更 {diff?.changed}・除外 {diff?.removed}。旧実績・固定目標は変更しません。</p>{preview.gaps.map((g,i)=><p key={i}>{g}</p>)}{preview.notes.map((n,i)=><p key={i}>{n}</p>)}</details></section>
 {referenceOnly&&<section className="plan-step"><h3><span>STEP 3</span> 参照保存</h3><p>現在のアカウントへ参照だけを保存します。正式採用・学習実績・固定目標は変更しません。</p><button className="plan-primary" disabled={blocked} onClick={()=>void save()}>{busy?'保存中…':'参照予定を保存'}</button></section>}</>}
 {notice&&<section className="plan-saved"><p role="status">{notice}</p>{onShowGantt&&<button className="plan-primary" onClick={onShowGantt}>ガントを見る</button>}</section>}
 <details className="plan-advanced" aria-label="詳細設定・エクスポート"><summary>詳細設定・エクスポート</summary>
 <p>現在：{identity.planId??'未登録'} ／ 資料revision {identity.revision??'—'} ／ アプリrevision {identity.appRevision??'—'}</p><p>旧revisionと固定目標は従来どおり履歴に保持します。</p>
 <button disabled={busy||!binding||!tasks.length} onClick={()=>downloadJson('task-catalog.v1.json',{schemaVersion:'task-catalog/1',generatedAt:new Date().toISOString(),accountBinding:binding,tasks:tasks.map(t=>({taskId:t.id,unit:t.unit,subject:t.subject,category:t.category,materialName:t.materialName,materialId:materialKey(t),title:t.title,status:t.status,wbs:t.planning?.wbs??null}))})}>計画作成用の課題一覧を保存</button>
 <button disabled={busy||!binding} onClick={()=>downloadJson('schedule-feedback.v1.json',exportScheduleFeedback(tasks,current,binding))}>照合・進捗・採用予定を保存</button>
 {current?.proposalImport&&<button disabled={busy} onClick={()=>setOfficial({source:current.proposalImport!.source})}>正式教材提案の照合を開く</button>}
 {official&&<OfficialSchedulePreview key={official.source.planId+official.source.revision+JSON.stringify(official.records)} source={official.source} initial={official.records} current={current} tasks={tasks} binding={binding} busy={busy} onPreview={p=>{setPreview(p);setReferenceOnly(false);setConfirmed(false);setNotice('');}}/>}
 {preview&&!referenceOnly&&<section className="plan-adoption"><h3>採用設定の確認</h3><p>{preview.planId} ／ アプリrevision {preview.revision}。対応・範囲・予定日の差分を確認してください。</p><label><input type="checkbox" aria-label="現在のアカウントへの取込を確認" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>現在のアカウントで対応と採用差分を確認しました</label><button disabled={blocked||!confirmed} onClick={()=>void save()}>採用設定を保存</button></section>}
 </details></section>;
}
