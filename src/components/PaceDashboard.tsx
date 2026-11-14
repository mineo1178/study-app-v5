import {automaticDeadline,visibleEvents,DEFAULT_CALENDAR,type EventCalendar,type DeadlineChange} from '../planning/events';
import {learningAlerts} from '../planning/learning-alerts';
import {paceMaker} from '../planning/pace-maker';
import {dashboardFacts} from '../planning/dashboard';
import type {PlanningTask} from '../planning/model';
import {canonical,type LearningSchedule} from '../planning/schedule';

export function PaceDashboard({tasks,plan,today,onSelect,proposal,calendar=DEFAULT_CALENDAR,deadlineHistory=[]}:{tasks:PlanningTask[];plan:LearningSchedule|null;today:string;onSelect:(id:string)=>void;proposal?:LearningSchedule|null;calendar?:EventCalendar;deadlineHistory?:DeadlineChange[]}){
 const active=paceMaker(tasks,plan,today),p=proposal?paceMaker(tasks,proposal,today):active;
 const summary=dashboardFacts(tasks,plan,today),alerts=learningAlerts(tasks,plan,calendar,today),rows=plan?.proposalImport?.source.planningPolicy.taskSchedules;
 const sourceProposal=Array.isArray(rows)&&rows.some(r=>plan?.items.some(i=>i.taskId===r.taskId&&canonical(i.stages)!==canonical(r.phases)));
 const adviceLabel=proposal||sourceProposal?'回復日程 r'+(proposal?.revision??plan?.proposalImport?.source.revision)+'を参照中（未採用）':p.allocationBasis==='existing_phase_dates_preserved'?'採用済み工程の残作業':'再配置案（未採用）';
 const next=[...p.allocations].filter(a=>a.phase!=='最終確認').sort((a,b)=>a.day.localeCompare(b.day))[0];
 const days=[today,...new Set(p.allocations.map(a=>a.day))].filter((d,i,a)=>a.indexOf(d)===i).sort();
 const unitDeadlines=[...new Set(tasks.map(t=>t.unit))].map(unit=>automaticDeadline(unit,calendar,plan?.capacities));
 const nextEvent=visibleEvents(calendar).find(e=>e.day>=today&&e.kind!=='closure'&&(!e.rounds.length||e.rounds.some(unit=>tasks.some(t=>t.unit===unit))));
 const unfinished=unitDeadlines.filter(d=>d.day&&tasks.some(t=>t.unit===d.unit&&t.status!=='completed')),upcoming=unfinished.filter(d=>d.day!>=today).sort((a,b)=>a.day!.localeCompare(b.day!))[0]??unfinished.sort((a,b)=>a.day!.localeCompare(b.day!))[0];
 const overdue=alerts.overdue.length;
 const deadline=summary.deadline??p.deadline,proposedDeadline=!summary.deadline;
 return <section className="pace-dashboard" aria-label="学習進捗サマリー">
  <div className="pace-cards">
   <div className="pace-card pace-completion"><span>全体進捗・課題完了率</span><strong>{summary.percent}<small>%</small></strong><span>{summary.counts.completed}/{summary.counts.total}件完了</span><div className="pace-bar" role="progressbar" aria-label="課題完了率" aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100}><i style={{width:summary.percent+'%'}}/></div></div>
   <div className="pace-card"><span>残課題</span><strong>残り{summary.counts.total-summary.counts.completed}<small>件</small></strong><span>取り組み中{summary.counts.inProgress}件</span></div>
   <div className={'pace-card pace-alert pace-alert-'+alerts.kind} aria-label="学習アラート"><span>学習ペース</span><strong>{alerts.text}</strong><span title={alerts.detail}>{alerts.detail}</span>{alerts.kind==='overdue'&&alerts.near.length>0&&<small>期限接近 {alerts.near.length}件</small>}</div>
   <div className="pace-card"><span>{nextEvent?nextEvent.label:upcoming?'完了期限':proposedDeadline?'提案期限':'次の期限'}</span><strong>{(nextEvent?.day??upcoming?.day??deadline).slice(5).replace('-','/')}<small>{nextEvent?'':'まで'}</small></strong>{upcoming&&<span>{upcoming.unit} {upcoming.confirmed?'完了目標':'仮案'}{upcoming.day!.slice(5).replace('-','/')}</span>}<span>{p.estimated===null?'残り時間は算出条件不足':'残り'+p.estimated+'分（'+(proposal||sourceProposal?'提案・':'')+'仮見積）'}</span></div>
  </div>
  <div className="pace-analysis"><span>赤 {active.formalRed}/{summary.comparisonTotal} ・ 紫 {active.formalPurple}/{summary.comparisonTotal}</span>{summary.missing.length>0&&<small title={summary.missing.join('・')}>不足：{summary.missing.map(reason=>({'範囲・総問題数':'範囲・総数','範囲別実績':'実績','日別数量・同じ範囲の予定':'日別数量','採用済み固定目標':'固定目標'}[reason])).join('・')}</small>}</div>
  <details><summary>学習提案・進捗の詳細</summary>
   {nextEvent&&<p>次のイベント：{nextEvent.name}（{nextEvent.day}・{nextEvent.rounds.join('・')||'対象回指定なし'}）</p>}{unitDeadlines.map(d=><p key={d.unit}>{d.unit} 自動完了期限：{d.day??'未設定'}{d.day&&!d.confirmed?'（仮案・未採用）':''}。{d.basis}</p>)}{deadlineHistory.map((h,i)=><p key={i}>{h.unit} 自動期限履歴：{h.before.day??'未設定'} → {h.after.day??'未設定'}（{h.changedAt}）</p>)}<p>過去の自動期限は履歴に保持し、現在の正式期限を優先して判定します。進捗未測定だけで学習未実施とは判定しません。自動期限は採用済み計画・手動終了日・固定目標と別で、赤紫の基準を自動変更しません。</p>
   <p>線は課題を展開して確認できます。親行は件数ベースの完了率、子課題は実績／手動の管理進捗率です。手動100%だけでは課題完了になりません。</p>
   <p>期限超過 {overdue}件 ／ 進捗遅延 {alerts.delayed.length}件 ／ 進捗比較不可 {alerts.rows.length-alerts.comparable.length}件。手動参考比較 {active.manualReference}件は正式比較と別です。</p>
   <p>{adviceLabel}・計画時間による仮見積。時間を進捗率には換算しません。{proposedDeadline&&'表示期限は提案で、採用済みの期限ではありません。'}</p>
   <p>仮容量 {p.available===null?'未確認':Math.floor(p.available)+'分'} ／ {p.shortfall===null?'見込み未確認':p.shortfall>0?'不足 '+Math.ceil(p.shortfall)+'分':'仮容量内・他の予定は未確認'}</p>
   {next&&<button onClick={()=>onSelect(next.taskId)}>次に取り組む課題を入力</button>}
   {proposal&&<p>回復日程r{proposal.revision}は未採用。進捗差は採用済み計画で比較します。</p>}
   {active.referenceDifference!==null&&<p>手動参考 {Math.round(active.referenceDifference*10)/10}pt（1課題・正式比較には含めません）</p>}
   {p.quantityTargets.map((q,i)=><p key={i}>{proposal?'候補数量（未採用）':'採用数量'} {q.day} {q.title}：演習{q.first}・採点{q.grading}・習得{q.mastery}問</p>)}
   {days.map(day=><div key={day}><b>{day===today?'今日':day}：{Math.ceil(p.allocations.filter(a=>a.day===day).reduce((n,a)=>n+a.minutes,0))}分</b>{p.allocations.filter(a=>a.day===day).map((a,i)=><p key={i}>{a.title}：{a.phase} {Math.ceil(a.minutes)}分{a.conditional?'（必要な場合）':''}</p>)}</div>)}
   {p.shortfalls.map((s,i)=><p key={i}>{s.title}：{s.phase} 不足{Math.ceil(s.minutes)}分／{s.reason}</p>)}
   {!!p.unconfirmed.length&&<p>範囲・総数の確認待ち {p.unconfirmed.length}課題。実際の残量は入力後に再計算します。</p>}
  </details>
 </section>;
}
