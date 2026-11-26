import {useMemo,useState} from 'react';
import {SUBJECTS,type Subject} from '../review/model';
import {displayItem} from '../planning/gantt-display';
import {materialTaskIdentity} from '../planning/material-binding';
import type {PlanningTask} from '../planning/model';
import type {LearningSchedule} from '../planning/schedule';
import {canConfirmWorkload,workloadEvidence} from '../planning/workload';

type Draft={label:string;units:string;minutes:string};
const emptyDraft:Draft={label:'',units:'',minutes:''};
type Props={tasks:PlanningTask[];plan:LearningSchedule|null;disabled:boolean;active:()=>boolean;onConfirm:(task:PlanningTask,draft:Draft)=>Promise<void>};

export function WorkloadReview({tasks,plan,disabled,active,onConfirm}:Props){
 const [round,setRound]=useState(''),[subject,setSubject]=useState('');
 const [drafts,setDrafts]=useState<Record<string,Draft>>({}),[errors,setErrors]=useState<Record<string,string>>({});
 const [saving,setSaving]=useState(false),[saved,setSaved]=useState<number|null>(null);
 const work=useMemo(()=>tasks.filter(task=>task.status!=='completed').flatMap(task=>{
  const item=displayItem(task,plan);
  if(item.endDay||item.stages?.length||item.ranges.some(r=>r.day))return [];
  const evidence=workloadEvidence(task,item.ranges,tasks,plan);
  return evidence.time?.kind==='registered'?[]:[{task,evidence,editable:canConfirmWorkload(task)&&!item.ranges.length&&!item.baseline.targetDay}];
 }),[tasks,plan]);
 const rounds=[...new Set(work.map(({task})=>task.unit))].sort((a,b)=>b.localeCompare(a,'ja',{numeric:true}));
 const selected=rounds.includes(round)?round:rounds[0]??'';
 const visible=work.filter(({task})=>task.unit===selected&&(!subject||task.subject===subject));
 const ready=work.filter(({task,editable})=>{
  const value=drafts[materialTaskIdentity(task)];
  return editable&&value?.label.trim()&&Number(value.units)>=0.01&&Number(value.units)<=10000&&Number(value.minutes)>=1&&Number(value.minutes)<=1440;
 });
 const locked=disabled||saving;

 function edit(identity:string,patch:Partial<Draft>){
  setDrafts(previous=>({...previous,[identity]:{...previous[identity]??emptyDraft,...patch}}));
  setErrors(previous=>({...previous,[identity]:''}));
 }

 async function save(){
  if(locked||!active()||!ready.length)return;
  setSaving(true);
  setSaved(null);
  const completed:string[]=[];
  const failed:Record<string,string>={};
  for(const {task} of ready){
   if(!active())break;
   const identity=materialTaskIdentity(task);
   try{
    await onConfirm(task,drafts[identity]);
    completed.push(identity);
   }catch(error){failed[identity]=error instanceof Error?error.message:'範囲・所要時間を保存できませんでした。';}
  }
  if(!active()){setSaving(false);return;}
  setDrafts(previous=>Object.fromEntries(Object.entries(previous).filter(([identity])=>!completed.includes(identity))));
  setErrors(previous=>({...Object.fromEntries(Object.entries(previous).filter(([identity])=>!completed.includes(identity))),...failed}));
  setSaved(completed.length);
  setSaving(false);
 }

 if(!rounds.length)return <p role="status">確認が必要な範囲・所要時間はありません。{saved!==null&&` ${saved}件を保存しました。`}</p>;
 return <div className="space-y-3">
  <div className="flex flex-wrap gap-3">
   <label>学習回 <select value={selected} onChange={e=>setRound(e.target.value)} disabled={locked}>{rounds.map(unit=><option key={unit}>{unit}</option>)}</select></label>
   <label>教科 <select value={subject} onChange={e=>setSubject(e.target.value)} disabled={locked}><option value="">すべて</option>{Object.entries(SUBJECTS).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
   <button type="button" disabled={locked||!ready.length} onClick={()=>void save()}>入力済み{ready.length}件を確定して保存</button>
  </div>
  <p>確認待ち {visible.length}件</p>
  <p>取り組み中の課題は、残りの範囲と作業量を入力してください。保存した範囲は次回の家庭教師同期で確認します。</p>
  {saving&&<p role="status">学習範囲を保存しています…</p>}
  {saved!==null&&<p role="status">{saved}件を保存しました。{Object.values(errors).some(Boolean)&&'保存できなかった行を確認してください。'}</p>}
  {!visible.length&&<p>この教科に確認待ちの課題はありません。</p>}
  {visible.map(({task,evidence,editable})=>{
   const identity=materialTaskIdentity(task);
   const value=drafts[identity]??emptyDraft,{scope,time}=evidence;
   return <fieldset key={identity} disabled={locked||!editable} className="min-w-0 rounded-lg border border-slate-300 px-3 pb-3">
    <legend>{task.title} ／ {SUBJECTS[task.subject as Subject]??task.subject} ／ {task.materialName}</legend>
    {scope&&<p>範囲候補 {scope.label} ／ {scope.source}{scope.units!==null&&` ／ 作業量 ${scope.units}`}</p>}
    {time?.kind==='estimated'&&<p>仮見積 {time.minutes===null?'合計未確認':`${time.minutes}分`} ／ 初回（採点済み）{time.firstSeconds??'未測定'}{time.firstSeconds!==null&&'秒'} ／ 採点単独は未測定 ／ 直し {time.redoSeconds===null?'未測定':`${time.redoSeconds}秒`} ／ {time.source}</p>}
    {editable?<>
     {scope&&<button type="button" onClick={()=>edit(identity,{label:scope.label,...(scope.units!==null?{units:String(scope.units)}:{})})}>範囲候補を入力欄に反映</button>}
     <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <label>範囲 <input className="block w-full rounded border p-1" maxLength={150} value={value.label} onChange={e=>edit(identity,{label:e.target.value})}/></label>
      <label>作業量 <input className="block w-full rounded border p-1" type="number" min={0.01} max={10000} step="any" value={value.units} onChange={e=>edit(identity,{units:e.target.value})}/></label>
      <label>予定分数 <input className="block w-full rounded border p-1" type="number" min={1} max={1440} step="any" value={value.minutes} onChange={e=>edit(identity,{minutes:e.target.value})}/></label>
     </div>
    </>:<p>既存の範囲・予定・目標、または進行中の学習を確認してください。</p>}
    {errors[identity]&&<p role="alert">{errors[identity]}</p>}
   </fieldset>;
  })}
 </div>;
}
