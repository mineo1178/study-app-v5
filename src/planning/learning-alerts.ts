import {automaticDeadline,type EventCalendar} from './events';
import {ganttLag} from './gantt-lag';
import {validDay,type PlanningTask} from './model';
import type {LearningSchedule} from './schedule';

export function taskDeadline(task:PlanningTask,plan:LearningSchedule|null,calendar:EventCalendar){
 const item=plan?.items.find(i=>i.taskId===task.id&&i.unit===task.unit&&i.subject===task.subject);
 const result=(day:string,source:string,scope:'task'|'round',confirmed=true)=>({day,source,scope,confirmed});
 if(task.planning?.deadline&&validDay(task.planning.deadline))return result(task.planning.deadline,'課題に明示された締切','task');
 if(item?.deadline&&validDay(item.deadline))return result(item.deadline,'採用済み計画の課題別締切','task');
 const explicit=calendar.deadlines.find(d=>d.unit===task.unit&&d.confirmed);
 if(explicit)return result(explicit.day,task.unit+'の正式完了期限：'+explicit.source,'round');
 const scope=plan?.scope.find(s=>s.unit===task.unit&&s.subjects.some(subject=>subject===task.subject));
 if(scope?.deadline&&validDay(scope.deadline))return result(scope.deadline,'採用済み計画の回別締切','round');
 const manual=task.planning?.wbs?.endDay||task.planning?.endDay;
 if(manual&&validDay(manual))return result(manual,'手動設定した終了予定日','task');
 if(item?.endDay&&validDay(item.endDay))return result(item.endDay,'採用済み計画の終了予定日','task');
 const automatic=automaticDeadline(task.unit,calendar,plan?.capacities);
 return {day:automatic.day,confirmed:automatic.confirmed,source:automatic.basis,scope:'round' as const};
}
export function taskLearningAlert(task:PlanningTask,plan:LearningSchedule|null,calendar:EventCalendar,today:string){
 const deadline=taskDeadline(task,plan,calendar),days=deadline.confirmed&&deadline.day?Math.round((Date.parse(deadline.day)-Date.parse(today))/86400000):null;
 const completed=task.status==='completed',red=completed?null:ganttLag([task],plan,today).manual;
 return {task,deadline,days,overdueDays:!completed&&days!==null&&days<0?-days:0,near:!completed&&days!==null&&days>=0&&days<=3,red,delayed:red!==null&&red<0};
}
export function learningAlerts(tasks:PlanningTask[],plan:LearningSchedule|null,calendar:EventCalendar,today:string){
 const rows=[...new Map(tasks.map(t=>[t.id,t])).values()].filter(t=>t.status!=='completed').map(t=>taskLearningAlert(t,plan,calendar,today));
 const overdue=rows.filter(r=>r.overdueDays>0).sort((a,b)=>a.deadline.day!.localeCompare(b.deadline.day!)||a.task.unit.localeCompare(b.task.unit)),near=rows.filter(r=>r.near).sort((a,b)=>a.days!-b.days!||a.task.id.localeCompare(b.task.id));
 const comparable=rows.filter(r=>r.red!==null),delayed=comparable.filter(r=>r.delayed),unknown=rows.filter(r=>!r.deadline.confirmed||!r.deadline.day);
 const difference=comparable.length?ganttLag(comparable.map(r=>r.task),plan,today,true).manual:null;
 const dates=[...new Set(overdue.map(r=>r.task.unit+'・期限'+r.deadline.day!.slice(5).replace('-','/')))];
 let kind:'overdue'|'near'|'delayed'|'unknown'|'within'='within',text='期限内',detail=comparable.length?'進捗遅延なし（比較可能な'+comparable.length+'課題）':'進捗比較は未測定';
 if(overdue.length){kind='overdue';text='期限超過 '+overdue.length+'件';detail=dates[0]+(dates.length>1?' ほか'+(dates.length-1)+'区分':'');}
 else if(near.length){kind='near';text=near[0].task.unit+'：'+(near[0].days===0?'今日が期限':'あと'+near[0].days+'日');detail='期限接近 '+near.length+'件・遅れ確定ではありません';}
 else if(delayed.length){kind='delayed';text=difference!==null&&difference<0?'予定より'+Math.round(-difference*10)/10+'pt遅れ':'進捗遅延 '+delayed.length+'件';detail='比較可能な'+comparable.length+'課題'+(difference===null?'（単位別のため件数表示）':'');}
 else if(unknown.length){kind='unknown';text='期限未設定';detail=unknown.length+'件の期限を確認（仮案は警告対象外）';}
 return {rows,overdue,near,comparable,delayed,unknown,difference,kind,text,detail};
}
