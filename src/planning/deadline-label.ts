import type {taskLearningAlert} from './learning-alerts';
type Alert=ReturnType<typeof taskLearningAlert>;
export function deadlineLabel(alert:Alert){
 if(alert.task.status==='completed'||!alert.deadline.confirmed||!alert.deadline.day)return null;
 const text=alert.overdueDays>0?'期限超過 '+alert.overdueDays+'日':alert.near?(alert.days===0?'期限当日':'期限接近 あと'+alert.days+'日'):null;
 if(!text)return null;
 return {text,tone:alert.overdueDays>0?'overdue':'near',description:`${text} ／ 期限日：${alert.deadline.day} ／ 根拠：${alert.deadline.source} ／ 状態：未完了（${alert.task.status==='in_progress'?'取り組み中':'未着手'}）`};
}
