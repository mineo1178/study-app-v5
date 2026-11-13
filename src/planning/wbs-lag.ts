import type {PlanningTask} from './model';
import type {LearningSchedule} from './schedule';
import {ganttLag} from './gantt-lag';
import {progressFacts} from './progress-summary';
import {scheduleDelay} from './wbs';
export const shortPoints=(value:number)=>{const n=Math.round(value*10)/10;return n===0?'予定内':(n>0?'＋':'−')+Math.abs(n)+'pt';};
export function lagIndicators(tasks:PlanningTask[],plan:LearningSchedule|null,today:string,parent=false){
 const lag=ganttLag(tasks,plan,today,parent),delay=Math.max(0,...tasks.map(t=>scheduleDelay(t,plan,today))),rows:{text:string;tone:string;description:string}[]=[];
 if(delay)rows.push({text:(parent?'最大':'')+delay+'日遅れ',tone:'manual',description:'採用済み終了予定日を過ぎた未完了課題です。手動100%でも完了扱いにしません。'});
 if(lag.manual===0&&lag.goal===0)rows.push({text:'予定内',tone:'',description:'実績と採用済み手動計画・固定目標の進捗差は0ptです。'});
 else{if(lag.manual!==null)rows.push({text:'赤 '+shortPoints(lag.manual),tone:'manual',description:'採用済み手動計画と実績の進捗差'});if(lag.goal!==null)rows.push({text:'紫 '+shortPoints(lag.goal),tone:'goal',description:'固定目標と同じ実績の進捗差'});}
 if(lag.manual===null&&lag.goal===null){const reference=!parent&&tasks.length===1?progressFacts(tasks[0],plan,today).reference:null;if(reference&&(reference.red!==null||reference.purple!==null)){rows.push({text:'手動参考差',tone:'reference',description:'管理用の手動進捗による参考比較です。実績ベースの遅れ件数には含めません。'});rows.push({text:[reference.red!==null?'赤 '+shortPoints(reference.red):'',reference.purple!==null?'紫 '+shortPoints(reference.purple):''].filter(Boolean).join('／'),tone:'reference',description:'採用済みの日別基準だけを参照しています。'});}else rows.push({text:'比較不可',tone:'',description:parent?'全子課題の実績・作業量・予定時間の重み・採用済み基準が必要です。':'不足項目は課題詳細の「進捗の根拠・赤紫分析」で確認できます。'});}
 return rows;
}
