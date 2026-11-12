import type { PlanningTask } from '../planning/model';
import type { LearningSchedule } from '../planning/schedule';
import { displayDifference,displayItem } from '../planning/gantt-display';
export function ProgressComparison({task,plan,today}:{task:PlanningTask;plan:LearningSchedule|null;today:string}){
 const comparison=displayDifference(task,displayItem(task,plan),today),delta=(v:{points:number})=>(v.points>=0?'+':'')+v.points.toFixed(1)+'pt';
 return <section className="parent-comparison" aria-label="選択課題の進捗差"><h3>{task.title}：進捗差</h3>{comparison.progress===null?<p>範囲の実績が未測定のため、線・ポイント差は表示していません。</p>:<><p>実績 {Math.round(comparison.progress)}% ／ 正は先行、負は遅れです。</p>{comparison.manual&&<p className="schedule-red">赤：採用済み手動計画との差 {delta(comparison.manual)}</p>}{comparison.goal&&<p className="schedule-purple">紫：固定目標基準との差 {delta(comparison.goal)}</p>}{(comparison.manual||comparison.goal)&&<svg viewBox="0 0 360 90" aria-label="選択課題の赤紫の進捗差"><line x1="180" x2="180" y1="0" y2="90" stroke="#8795aa"/>{[comparison.manual,comparison.goal].map((value,i)=>value&&<polyline key={i} points={'180,0 '+(180+Math.max(-160,Math.min(160,value.points*1.6)))+',45 180,90'} fill="none" stroke={i?'#7e22ce':'#dc2626'} strokeWidth="3" strokeDasharray={i?'6 4':undefined}/>)}</svg>}{!comparison.manual&&!comparison.goal&&<p>比較する日別計画・固定基準が未設定です。</p>}</>}</section>;
}
