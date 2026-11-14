import type {PlanningTask} from './model';
import type {LearningSchedule} from './schedule';
import {wbsDates} from './wbs';
import {gridDay} from './gantt-grid';
import {taskDeadline} from './learning-alerts';
import type {EventCalendar} from './events';

export function adoptedDay(task:PlanningTask,plan:LearningSchedule|null,day:string){
 const dates=wbsDates(task,plan);
 return !!(dates.start&&dates.end&&dates.startSource!=='提案'&&dates.endSource!=='提案'?day>=dates.start&&day<=dates.end:gridDay([task],plan,day).planned);
}
export function adoptedAudit(task:PlanningTask,plan:LearningSchedule|null,calendar:EventCalendar){
 const dates=wbsDates(task,plan),deadline=taskDeadline(task,plan,calendar),item=plan?.items.find(i=>i.taskId===task.id&&i.unit===task.unit&&i.subject===task.subject);
 const manual=task.planning?.wbs,source=manual?.startDay||manual?.endDay?'手動設定':item?'採用済み計画 '+plan!.planId+' r'+plan!.revision:'既存範囲予定';
 const end=dates.endSource!=='提案'?dates.end:null;
 const conflict=!!(deadline.confirmed&&deadline.day&&end&&end>deadline.day);
 return{taskId:task.id,unit:task.unit,start:dates.start,end,deadline:deadline.day,source,conflict,detail:`${source}／taskId=${task.id}／${dates.start??'未設定'}〜${end??'未設定'}／開始根拠 ${dates.startSource}・終了根拠 ${dates.endSource}／計画 ${plan?plan.planId+' r'+plan.revision:'未登録'}／正式期限 ${deadline.day??'未設定'}`};
}
