import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { emptyPlan, rangeComplete, validatePlan, validatePlanTransition, type TaskPlan } from "./model";
export async function saveTaskPlan(db: Firestore, family: string, taskId: string, expectedRevision: number, plan: TaskPlan, active: () => boolean, complete = false, scheduleContext?:{uid:string;versionId:string|null}) {
  validatePlan(plan);
  if(plan.wbs && plan.wbs.taskId!==taskId)throw Error("WBSの対象課題を確認してください。");
  return runTransaction(db, async tx => {
    const ref = doc(db, "families", family, "tasks", taskId);
    const snapshot = await tx.get(ref);
    if(scheduleContext){const pointer=await tx.get(doc(db,'families',family,'learningSchedules',scheduleContext.uid));if((pointer.data()?.versionId??null)!==scheduleContext.versionId)throw Error('採用計画が更新されました。目標を開き直してください。');}
    if (!active()) throw new Error("利用者が切り替わりました。");
    if (!snapshot.exists()) throw new Error("タスクが削除されています。");
    const task = snapshot.data();
    const old = task.planning ?? emptyPlan();
    if (old.revision !== expectedRevision) throw new Error("別の端末で計画が更新されました。最新の計画を開き直してください。");
    validatePlanTransition(old, plan);
    if (complete && (task.isRunning || task.currentDuration > 0 || !plan.ranges.length || !plan.ranges.every(rangeComplete))) throw new Error("すべての範囲の採点・直しを終え、タイマーを保存してください。");
    tx.update(ref, { planning: { ...plan, revision: expectedRevision + 1 }, ...(complete ? { status: "completed" } : {}) });
  });
}
