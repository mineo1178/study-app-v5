import { getDocs, limit, orderBy, query, type Firestore } from "firebase/firestore";
import { getCalculationAttempts, getCalculationDays, type CalculationAttempt } from "../daily-calculation";
import { calculationEvidence } from "./target-time";
import type { PlanningTask } from "./model";
export async function loadCalculationHistory(db: Firestore, family: string, uid: string, excludeDay?: string): Promise<CalculationAttempt[]> {
  const days=await getDocs(query(getCalculationDays(db,family,uid),orderBy('dateKey','desc'),limit(30)));
  const rows=await Promise.all(days.docs.filter(day=>day.id!==excludeDay).map(day=>getDocs(getCalculationAttempts(db,family,uid,day.id))));
  return rows.flatMap(snap=>snap.docs.map(d=>d.data() as CalculationAttempt));
}
export function withCalculationHistory(tasks: PlanningTask[], attempts: CalculationAttempt[]): PlanningTask[] {
  const evidence=calculationEvidence(attempts);
  return tasks.map(task=>{
    if(task.category!=='計算')return task;
    const rows=evidence.filter(row=>row.taskId===task.id);
    return rows.length?{...task,history:rows.map(row=>({duration:row.elapsedSeconds,score:row.score,graded:true,attemptType:row.attemptType,units:7,endAt:row.finishedAt,operationCheck:row.operationCheck??false}))}:task;
  });
}
