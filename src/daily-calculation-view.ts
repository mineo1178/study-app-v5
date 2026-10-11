import { calculationAttemptLabel, type CalculationAttempt, type CalculationDay } from "./daily-calculation";

export const calculationStartLabel = (day?: CalculationDay) =>
  !day ? "計算をはじめる" : day.bestScore === 7 ? "もう一度挑戦する" : "解き直しをする";

// Both charts and the list use the same selected-day records, without changing saved attempts.
export const calculationAttemptTrend = (attempts: CalculationAttempt[], dateKey: string) =>
  attempts.filter((attempt) => attempt.dateKey === dateKey)
    .sort((a, b) => a.attemptNo - b.attemptNo)
    .map((attempt) => ({
      id: attempt.id,
      attemptNo: attempt.attemptNo,
      label: attempt.attemptNo === 1 ? "初回" : calculationAttemptLabel(attempt.attemptNo),
      score: attempt.score,
      elapsedSeconds: attempt.elapsedSeconds,
    }));

// The stored sequence is shared by a UID/day. Derive task-local trial numbers
// from the complete append-only day, without rewriting legacy records.
export const calculationTaskRecords = (attempts: CalculationAttempt[]) => {
  const groups = new Map<string, CalculationAttempt[]>();
  for (const attempt of attempts) {
    const key = JSON.stringify([attempt.dateKey, attempt.taskId ?? ""]);
    const group = groups.get(key) ?? [];
    group.push(attempt); groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const saved = group.sort((a, b) => a.attemptNo - b.attemptNo);
    const first = saved[0], latest = saved.at(-1)!;
    return {
      dateKey: first.dateKey, taskId: first.taskId ?? "", taskLabel: first.taskId ? first.taskLabel ?? `計算課題 (${first.taskId})` : "課題未指定",
      attemptCount: saved.length, firstScore: first.score, firstElapsedSeconds: first.elapsedSeconds,
      latestScore: latest.score, latestElapsedSeconds: latest.elapsedSeconds,
      bestScore: saved.reduce((best, item) => Math.max(best, item.score), 0), latestAttemptId: latest.id,
      history: saved.map((item, index) => ({ ...item, trialNo: index + 1, label: index === 0 ? "初回" : `解き直し${index}回目` })),
    };
  }).sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.taskLabel.localeCompare(b.taskLabel));
};

export const isCalculationTask = (task: { subject: string; category: string }) => task.subject === "math" && task.category === "計算";
