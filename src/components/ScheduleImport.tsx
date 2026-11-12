import { OfficialSchedulePreview } from './OfficialSchedulePreview';
import { exportScheduleFeedback, readOfficialFile } from '../planning/official-schedule';
import type { OfficialPlan, ProposalResolution } from '../planning/official-schema';
import { useEffect, useRef, useState } from 'react';
import type { LearningSchedule } from '../planning/schedule';
import { canonical, materialKey, parseSchedule, scheduleDiff, scheduleErrors } from '../planning/schedule';
import type { PlanningTask } from '../planning/model';
import { downloadJson } from '../planning/download-json';
export function ScheduleImport({current,tasks,binding,busy,active,onImport}:{current:LearningSchedule|null;tasks:PlanningTask[];binding:string;busy:boolean;active:()=>boolean;onImport:(plan:LearningSchedule)=>Promise<void>}){
 const [official,setOfficial]=useState<{source:OfficialPlan;records?:ProposalResolution[]}|null>(null);
 const [preview,setPreview]=useState<LearningSchedule|null>(null),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false),[notice,setNotice]=useState('');const generation=useRef(0);
 useEffect(()=>()=>{++generation.current;},[]);
 const errors=preview?scheduleErrors(preview,tasks,binding):[],diff=preview?scheduleDiff(preview,current):null;
 const same=!!preview&&current?.planId===preview.planId&&current.revision===preview.revision,identical=same&&canonical(current)===canonical(preview);
 const revisionError=same&&!identical?'同じrevisionの内容が変わっています。ローカルでrevisionを増やしてください。':preview&&current?.planId===preview.planId&&preview.revision<current.revision?'旧revisionは取り込めません。':'';
 return <details className="schedule-import"><summary>保護者：ローカル計画JSONの取込・更新</summary><p>予定の正本はローカルの計画ファイルです。ファイルを選び、差分を確認して取り込むと、この認証アカウントで次回も表示できます。Windowsのファイル更新は自動監視しません。更新したら再選択してください。</p>
 <p>現在：{current?current.planId+' / revision '+current.revision+' / 更新 '+new Date(current.generatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未取込'}</p>
 <label>計画JSONを選択<input aria-label="学習計画JSON" type="file" accept="application/json,.json" disabled={busy||!binding||!tasks.length} onChange={async e=>{const f=e.target.files?.[0],request=++generation.current;if(!f)return;setError('');setConfirmed(false);setNotice('');try{if(f.size>150000)throw new Error('計画ファイルは150KBまでです。');const raw=await f.text(),v=JSON.parse(raw);if(v.schemaVersion==='learning-schedule/1'){const plan=parseSchedule(raw);if(active()&&request===generation.current){if(plan.accountBinding&&plan.accountBinding!==binding)throw new Error('計画のアカウント識別子が現在の認証アカウントと一致しません。');if(plan.proposalImport){setOfficial({source:plan.proposalImport.source,records:plan.proposalImport.records});setPreview(null);}else{setPreview(plan);setOfficial(null);}}}else{const source=readOfficialFile(raw,binding);if(active()&&request===generation.current){setOfficial(source);setPreview(null);}}}catch(err){if(active()&&request===generation.current){setPreview(null);setOfficial(null);setError((err as Error).message);}}}} /></label>
 <button disabled={busy||!binding||!tasks.length} onClick={()=>downloadJson('task-catalog.v1.json',{schemaVersion:'task-catalog/1',generatedAt:new Date().toISOString(),accountBinding:binding,tasks:tasks.map(t=>({taskId:t.id,unit:t.unit,subject:t.subject,category:t.category,materialName:t.materialName,materialId:materialKey(t),title:t.title,status:t.status}))})}>計画作成用の課題一覧を保存</button><p className="schedule-small">課題一覧は私的資料です。公開Gitへ入れないでください。アカウント識別子を計画へ転記すると、別アカウントへの誤取込を検出できます。UIDはファイルへ書き出しません。</p>
 <p>対応形式：learning-schedule/1、正式予定1.0.0、アプリ照合・進捗エクスポート。個人PDF・private evidenceは取り込みません。</p><button disabled={busy||!binding} onClick={()=>downloadJson("schedule-feedback.v1.json",exportScheduleFeedback(tasks,current,binding))}>照合・進捗・採用予定を保存</button><p>出力範囲：実taskId・教材対応・範囲進捗・採用日/固定基準・同条件の時間集計・未対応理由。回答本文・成績・認証情報・個人PDFは出力しません。私的ローカル再計画用です。</p>{current?.proposalImport&&<button disabled={busy} onClick={()=>setOfficial({source:current.proposalImport!.source})}>保存済み正式提案の照合を続ける</button>}{official&&<OfficialSchedulePreview key={official.source.planId+official.source.revision+JSON.stringify(official.records)} source={official.source} initial={official.records} current={current} tasks={tasks} binding={binding} busy={busy} onPreview={p=>{setPreview(p);setConfirmed(false);setNotice("");}}/>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {preview&&diff&&<section aria-label="学習計画の取込プレビュー"><h3>{preview.planId} / revision {preview.revision} {preview.provisional?'（仮計画）':''}</h3><p>追加{diff.added}件・変更{diff.changed}件・変更なし{diff.unchanged}件・計画対象から除外{diff.removed}件・不一致{errors.length}件</p><p>除外されても既存タスク・実績・旧計画は削除しません。1件でも不一致があれば全体を取り込みません。</p>
 <ul>{errors.map((e,i)=><li key={i}>{e}</li>)}{preview.gaps.map((g,i)=><li key={'gap'+i}>未確認：{g}</li>)}</ul>{preview.notes.map((n,i)=><p key={i}>{n}</p>)}
 <details><summary>課題ごとの差分</summary>{preview.items.map(i=>{const old=current?.items.find(o=>o.taskId===i.taskId);return <p key={i.taskId}>{!old?'追加':canonical(old)===canonical(i)?'変更なし':'変更'}：{i.unit} / {i.subject} / {i.title} ／ 予定日 {old?.endDay??'未確認'} → {i.endDay??'未確認'}</p>;})}</details>
 {revisionError&&<p role="alert">{revisionError}</p>}{identical&&<p role="status">同じrevision・同じ内容です。再登録は不要です。</p>}
 {!preview.accountBinding&&<p>宛先アカウント未指定の私的計画です。照合済みtaskIdを、現在ログインしているアカウントにのみ取り込みます。</p>}
 <label><input type="checkbox" aria-label="現在のアカウントへの取込を確認" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} />現在のアカウントの課題と確認しました。既存実績を変更せず計画を取り込みます。</label>
 <button disabled={busy||!confirmed||!!errors.length||!!revisionError||identical} onClick={async()=>{if(!active())return;setError('');try{await onImport(preview);if(active()){setNotice('計画を取り込みました。学習実績・回答履歴は変更していません。');setConfirmed(false);}}catch(e){if(active())setError((e as Error).message);}}}>{busy?'保存中…':'差分を確認して計画を取り込む'}</button></section>}
 </details>;
}
