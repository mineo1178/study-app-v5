import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { emptyPlan, rangeComplete, validatePlan, type TaskPlan } from "./model";
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
    if (old.baseline) {
      const weights = (p: TaskPlan) => p.ranges.map(r => [r.id, r.units, r.minutes]);
      if (JSON.stringify(weights(old)) !== JSON.stringify(weights(plan))) throw new Error("固定目標作成後の作業量は変更できません。");
      const expectedHistory = [...old.baselineHistory, ...(old.baseline.id !== plan.baseline?.id ? [old.baseline] : [])];
      if (JSON.stringify(expectedHistory) !== JSON.stringify(plan.baselineHistory) || (old.baseline.id === plan.baseline?.id && JSON.stringify(old.baseline) !== JSON.stringify(plan.baseline))) throw new Error("固定目標と改訂履歴を維持してください。");
    }
    if (complete && (task.isRunning || task.currentDuration > 0 || !plan.ranges.length || !plan.ranges.every(rangeComplete))) throw new Error("すべての範囲の採点・直しを終え、タイマーを保存してください。");
    tx.update(ref, { planning: { ...plan, revision: expectedRevision + 1 }, ...(complete ? { status: "completed" } : {}) });
  });
}
