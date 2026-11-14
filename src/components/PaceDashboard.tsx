import {adoptedAudit} from '../planning/schedule-layers';
import type {RecoverySchedule} from '../planning/recovery-schedule';
import {automaticDeadline,visibleEvents,DEFAULT_CALENDAR,type EventCalendar,type DeadlineChange} from '../planning/events';
import {learningAlerts} from '../planning/learning-alerts';
import {paceMaker} from '../planning/pace-maker';
import {dashboardFacts} from '../planning/dashboard';
import type {PlanningTask} from '../planning/model';
import {type LearningSchedule} from '../planning/schedule';

export function PaceDashboard({recovery,tasks,plan,today,onSelect,proposal,calendar=DEFAULT_CALENDAR,deadlineHistory=[]}:{recovery:RecoverySchedule;tasks:PlanningTask[];plan:LearningSchedule|null;today:string;onSelect:(id:string)=>void;proposal?:LearningSchedule|null;calendar?:EventCalendar;deadlineHistory?:DeadlineChange[]}){
 const active=paceMaker(tasks,plan,today),p=active;
 const summary=dashboardFacts(tasks,plan,today),alerts=learningAlerts(tasks,plan,calendar,today);
 const adviceLabel='全未完了課題の推奨予定（未採用・都度再計算）';
 const conflicts=[...new Map(tasks.map(t=>[t.id,adoptedAudit(t,plan,calendar)])).values()].filter(a=>a.conflict);
 const next=[...recovery.allocations].filter(a=>a.phase!=='最終確認').sort((a,b)=>a.day.localeCompare(b.day))[0];
 const days=[today,...new Set(recovery.allocations.map(a=>a.day))].filter((d,i,a)=>a.indexOf(d)===i).sort();
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
   <div className="pace-card"><span>{nextEvent?nextEvent.label:upcoming?'完了期限':proposedDeadline?'提案期限':'次の期限'}</span><strong>{(nextEvent?.day??upcoming?.day??deadline).slice(5).replace('-','/')}<small>{nextEvent?'':'まで'}</small></strong>{upcoming&&<span>{upcoming.unit} {upcoming.confirmed?'完了目標':'仮案'}{upcoming.day!.slice(5).replace('-','/')}</span>}<span>{'既知の残作業 '+recovery.knownMinutes+'分（仮見積）'+(recovery.unknown.length?'・未確認あり':'')}</span></div>
  </div>
  <div className="pace-analysis">{[...new Set(conflicts.map(a=>a.unit))].map(unit=><span className="sheet-plan-warning" key={unit}>{unit}：期限後の予定{conflicts.filter(a=>a.unit===unit).length}課題</span>)}<span>赤 {active.formalRed}/{summary.comparisonTotal} ・ 紫 {active.formalPurple}/{summary.comparisonTotal}</span>{summary.missing.length>0&&<small title={summary.missing.join('・')}>不足：{summary.missing.map(reason=>({'範囲・総問題数':'範囲・総数','範囲別実績':'実績','日別数量・同じ範囲の予定':'日別数量','採用済み固定目標':'固定目標'}[reason])).join('・')}</small>}</div>
  <details><summary>学習提案・進捗の詳細</summary>
   {nextEvent&&<p>次のイベント：{nextEvent.name}（{nextEvent.day}・{nextEvent.rounds.join('・')||'対象回指定なし'}）</p>}{unitDeadlines.map(d=><p key={d.unit}>{d.unit} 自動完了期限：{d.day??'未設定'}{d.day&&!d.confirmed?'（仮案・未採用）':''}。{d.basis}</p>)}{deadlineHistory.map((h,i)=><p key={i}>{h.unit} 自動期限履歴：{h.before.day??'未設定'} → {h.after.day??'未設定'}（{h.changedAt}）</p>)}<p>過去の自動期限は履歴に保持し、現在の正式期限を優先して判定します。進捗未測定だけで学習未実施とは判定しません。自動期限は採用済み計画・手動終了日・固定目標と別で、赤紫の基準を自動変更しません。</p>
   <p>線は課題を展開して確認できます。親行は件数ベースの完了率、子課題は実績／手動の管理進捗率です。手動100%だけでは課題完了になりません。</p>
   <p>期限超過 {overdue}件 ／ 進捗遅延 {alerts.delayed.length}件 ／ 進捗比較不可 {alerts.rows.length-alerts.comparable.length}件。手動参考比較 {active.manualReference}件は正式比較と別です。</p>
   <p>{adviceLabel}・計画時間による仮見積。時間を進捗率には換算しません。{proposedDeadline&&'表示期限は提案で、採用済みの期限ではありません。'}</p>
   <p>全課題共通の既知残容量 {Math.floor(recovery.available)}分 ／ 未配置の既知作業 {Math.ceil(recovery.unallocated)}分。確度：{recovery.confidence}。{recovery.feasible?'既知条件の仮容量内':'全体の実行可能性は未確認'}。期限前の回を優先し、期限超過分は残容量へ配置します。正式期限は変更しません。</p><p>範囲・時間等の未確認 {recovery.unknown.length}課題／容量未確認 {recovery.missingCapacity.length}日。未確認作業の容量は確保できていません。学習時間を進捗には換算しません。</p>{recovery.unknown.map(j=><p key={j.taskId}>{j.unit} {j.title}：{j.unknown.join('・')}未確認</p>)}{Object.entries(recovery.ledger).map(([day,d])=><p key={day}>{day}：容量{d.gross??'未確認'}分・保存済み学習{Math.ceil(d.spent)}分・推奨{Math.ceil(d.used)}分・残り{Math.floor(d.remaining)}分</p>)}
   {next&&<button onClick={()=>onSelect(next.taskId)}>次に取り組む課題を入力</button>}
   {proposal&&<p>回復日程r{proposal.revision}は未採用。進捗差は採用済み計画で比較します。</p>}
   {active.referenceDifference!==null&&<p>手動参考 {Math.round(active.referenceDifference*10)/10}pt（1課題・正式比較には含めません）</p>}
   {p.quantityTargets.map((q,i)=><p key={i}>採用数量 {q.day} {q.title}：演習{q.first}・採点{q.grading}・習得{q.mastery}問</p>)}
   {days.map(day=><div key={day}><b>{day===today?'今日':day}：{Math.ceil(recovery.allocations.filter(a=>a.day===day).reduce((n,a)=>n+a.minutes,0))}分</b>{recovery.allocations.filter(a=>a.day===day).map((a,i)=><p key={i}>{a.unit} {a.title}{a.recovery?'（期限後の回復案）':''}：{a.phase} {Math.ceil(a.minutes)}分{a.conditional?'（必要な場合）':''}</p>)}</div>)}
   {recovery.shortfalls.map((s,i)=><p key={i}>{s.title}：{s.phase} 不足{Math.ceil(s.minutes)}分／{s.reason}</p>)}
   {!!p.unconfirmed.length&&<p>範囲・総数の確認待ち {p.unconfirmed.length}課題。実際の残量は入力後に再計算します。</p>}
  </details>
 </section>;
}
