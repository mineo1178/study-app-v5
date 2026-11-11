import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { emptyPlan, rangeComplete, validatePlan, validatePlanTransition, type TaskPlan } from "./model";
export async function saveTaskPlan(db: Firestore, family: string, taskId: string, expectedRevision: number, plan: TaskPlan, active: () => boolean, complete = false) {
  validatePlan(plan);
  return runTransaction(db, async tx => {
    const ref = doc(db, "families", family, "tasks", taskId);
    const snapshot = await tx.get(ref);
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
