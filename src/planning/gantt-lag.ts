import type {PlanningTask} from './model';
import type {LearningSchedule} from './schedule';
import {displayDifference,displayItem} from './gantt-display';
export function ganttLag(tasks:PlanningTask[],plan:LearningSchedule|null,today:string,parent=false){
 const rows=tasks.map(task=>{const item=displayItem(task,plan);const c=displayDifference(task,item,today),known=c.progress!==null&&Number.isFinite(c.progress);return{...c,manual:known&&c.manual&&Number.isFinite(c.manual.points)?c.manual:null,goal:known&&c.goal&&Number.isFinite(c.goal.points)?c.goal:null,weight:item.ranges.reduce((n,r)=>n+r.minutes,0)};});
 if(!parent&&rows.length===1)return{manual:rows[0].manual?.points??null,goal:rows[0].goal?.points??null};
 const sum=rows.reduce((n,r)=>n+r.weight,0),measured=rows.length>0&&rows.every(r=>r.progress!==null&&Number.isFinite(r.progress)&&r.weight>0&&Number.isFinite(r.weight));
 const weighted=(key:'manual'|'goal')=>measured&&rows.every(r=>r[key]!==null)?rows.reduce((n,r)=>n+r[key]!.points*r.weight,0)/sum:null;
 return{manual:weighted('manual'),goal:weighted('goal')};
}
export function lagLabel(points:number){const rounded=Math.round(points*10)/10;return rounded===0?'予定どおり':(rounded>0?'＋':'−')+Math.abs(rounded)+'pt '+(rounded>0?'先行':'遅れ');}
export function comparisonReasons(task:PlanningTask,plan:LearningSchedule|null,today:string){
 const item=displayItem(task,plan),c=displayDifference(task,item,today),points=ganttLag([task],plan,today),units=item.ranges.reduce((n,r)=>n+r.units,0);
 const progress=c.progress===null||!Number.isFinite(c.progress)?!item.ranges.length||!Number.isFinite(units)||units<=0?'範囲・作業量が未登録または有効な数値ではないため、実績進捗率を計算できません。':'採点・必要な直しまでの範囲実績が未測定です。学習時間だけでは進捗率を推測しません。':null;
 return{progress,manual:points.manual===null?progress??(c.manual===null?'採用済み日別予定の作業量・基準が未設定です。未採用提案は遅れ判定に使いません。':'採用済み日別予定の基準値を計算できません。'):null,goal:points.goal===null?progress??(c.goal===null?'採用済み固定目標の日別基準が未設定です。':'採用済み固定目標の基準値を計算できません。'):null};
}
