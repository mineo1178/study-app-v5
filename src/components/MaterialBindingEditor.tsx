import {useState} from 'react';
import {bindingCandidates,bindingDiff,bindingFamily,bindingMaterial,type MaterialBinding} from '../planning/material-binding';
import type {PlanningTask} from '../planning/model';
import {SUBJECTS} from '../review/model';
import {downloadJson} from '../planning/download-json';

type Props={task:PlanningTask;record:MaterialBinding|null;sample:boolean;projectId:string;familyId:string;onSave:(task:PlanningTask,revision:number,id:string|null)=>Promise<MaterialBinding>};
const label=(m:ReturnType<typeof bindingCandidates>[number])=>m.name+(m.difficulty?' '+m.difficulty:'')+(m.topic?'（'+m.topic+'）':'');
export function MaterialBindingEditor({task,record,sample,projectId,familyId,onSave}:Props){
 const candidates=bindingCandidates(task),confirmed=bindingMaterial(task,record);
 const [selection,setSelection]=useState(confirmed?.materialId??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 if(!bindingFamily(task)&&!record)return null;
 async function save(id:string|null){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{await onSave(task,record?.revision??0,id);setNotice(id?'教材対応を保存しました。':'教材対応を解除しました。');setSelection(id??'');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="sheet-material-binding" aria-label="教材の対応確認"><h4>教材の対応確認</h4><p>登録名：{task.materialName} ／ {task.title}<br/>{task.unit}・{SUBJECTS[task.subject as keyof typeof SUBJECTS]??task.subject}</p><p role="status">{confirmed?'利用者確認済み：'+label(confirmed):record?.materialId?'登録情報または候補が変わったため、対応を再確認してください。':'対応未確認'}</p><p>手元のPDFの表題・区分・単元を確認して選択してください。旧登録のA/B/Sだけでは確定しません。</p>{candidates.length?<><label>候補教材<select aria-label="候補教材" value={selection} disabled={busy} onChange={e=>{setSelection(e.target.value);setError('');setNotice('');}}><option value="">教材を選択してください</option>{candidates.map(m=><option key={m.materialId} value={m.materialId}>{label(m)}</option>)}</select></label><button disabled={busy||!selection||selection===confirmed?.materialId} onClick={()=>void save(selection)}>選択した教材との対応を確定</button></>:<p>対応する確認済みPDFが台帳にありません。教材の追加確認が必要です。</p>}{record?.materialId&&<button disabled={busy} onClick={()=>void save(null)}>教材対応を解除</button>}{record&&<><p>確認日時：{record.confirmedAt} ／ {sample?'サンプル：この端末だけに保存':'アカウント別にクラウド保存（同じアカウントの別端末で共有）'}</p><p>共通教材台帳：未同期。差分JSONを保存し、ローカル台帳へ照合・反映してください。</p><button disabled={busy} onClick={()=>downloadJson('material-binding-diff.json',bindingDiff(task,record,projectId,familyId))}>台帳反映用の差分JSONを保存</button></>}{busy&&<p role="status">教材対応を保存しています…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
