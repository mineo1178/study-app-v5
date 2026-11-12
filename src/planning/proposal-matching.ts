import type { PlanningTask } from './model';
import type { OfficialProposal } from './official-schema';
import { materialKey } from './schedule';
const family=(s:string)=>['確認テスト','計算テスト','漢字','言語知識','基礎力強化','まとめプリント'].find(k=>s.includes(k));
const scope=(p:OfficialProposal)=>`PDF p${p.scope.pdfPages.join('・')||'未確認'}／${p.scope.instructions}`;
export function assessProposal(p:OfficialProposal,tasks:PlanningTask[]){
 const kind=family(p.title),difficulty=/ADVANCE/.test(p.title)?'A':/STANDARD/.test(p.title)?'S':/BASIC/.test(p.title)?'B':null;
 const candidates=tasks.filter(t=>t.unit===`第${p.round}回`&&t.subject===p.subject).map(task=>{
  const identity=materialKey(task)===p.materialId,category=task.category===p.category,sameScope=!!task.planning?.ranges.some(r=>r.label===scope(p))&&!/to_confirm|unconfirmed/.test(p.scope.selection),sameFamily=!!kind&&family(task.title+' '+task.materialName)===kind;
  const grade=!!difficulty&&new RegExp('テスト'+difficulty+'(?:$|[^A-Za-z])').test(task.title+' '+task.materialName);
  const differences=[...(!category?['カテゴリ：提案「'+p.category+'」／既存「'+task.category+'」']:[]),...(!identity?['materialId：'+(task.planning?.material?.materialId?'相違・同一性の確認が必要':'既存未登録')]:[]),...(!sameScope?['対象範囲：'+(task.planning?.ranges.length?'同一範囲か要確認':'既存のページ・範囲が未登録')]:[]),...(grade&&!identity?['難易度表記：'+difficulty+'と'+(/ADVANCE|STANDARD|BASIC/.exec(p.title)?.[0]??'')+'の対応は未確認']:[])];
  return{task,exact:identity&&category&&sameScope,related:identity||sameFamily,score:(identity?100:0)+(sameScope?50:0)+(sameFamily?10:0)+(category?3:0)+(grade?5:0),differences};
 }).filter(c=>c.related).sort((a,b)=>b.score-a.score||a.task.id.localeCompare(b.task.id));
 const exact=candidates.filter(c=>c.exact),rank=exact.length===1?'A':candidates.length?'B':'C';
 return{rank,candidates,reason:rank==='A'?'回・教科・カテゴリ・materialId・確認済み範囲が一意に一致。保護者の対応確認と採用確認が必要。':rank==='B'?'関連候補あり。教材の同一性・対象範囲に未確認事項があるため、確定には保護者の確認が必要。':'同一教材・範囲の根拠を持つ候補なし。未対応として保持。'};
}
export function candidateReason(p:OfficialProposal,task:PlanningTask){const a=assessProposal(p,[task]),c=a.candidates[0];return c?`${a.rank}候補：第${p.round}回・同教科。${c.differences.join('／')||'カテゴリ・materialId・確認済み範囲が一致'}。教材と範囲を保護者が確認してください。`:'回・教科は一致。教材・カテゴリ・範囲の対応根拠を保護者が確認してください。';}
