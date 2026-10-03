import { doc, getDocsFromServer, runTransaction, type CollectionReference, type DocumentData, type Firestore } from "firebase/firestore";
import { getCreditedStudyMinutes, getElapsedSeconds, getLatestRunningTask, getPausedTaskUpdates, getSessionReviewFlags, type SessionReviewFlag, type StudyTaskLike } from "./study-utils";

export type SessionTask = Omit<StudyTaskLike, "history"> & {
  sessionId?: string;
  pendingSync?: boolean;
  lastActivityAt?: number;
  lastUpdatedAt?: number;
  currentMemo?: string;
  sessionReviewFlags?: SessionReviewFlag[];
  history: (StudyTaskLike["history"][number] & { id?: string; memo?: string })[];
};
export type StudySessionOperation = {
  operationId: string;
  taskId: string;
  kind: "start" | "pause" | "save";
  sessionId: string;
  at: number;
  memo?: string;
  reviewFlags?: SessionReviewFlag[];
};
export const getStudySessionId = (task: SessionTask) => task.sessionId ||
  `legacy-${task.id}-${task.sessionStartTime ?? task.lastActivityAt ?? `paused-${task.currentDuration}-${task.history.length}-${task.history.at(-1)?.id ?? "none"}`}`;

export const createStudySessionOperation = (task: SessionTask, kind: StudySessionOperation["kind"], at = Date.now()): StudySessionOperation => ({
  operationId: crypto.randomUUID(), taskId: task.id, kind, sessionId: getStudySessionId(task), at,
  memo: task.currentMemo ?? "", reviewFlags: task.sessionReviewFlags ?? [],
});

export const prepareStudySessionOperation = (tasks: SessionTask[], operation: StudySessionOperation) => {
  const current = tasks.find((task) => task.id === operation.taskId);
  const updates = new Map<string, Partial<SessionTask>>();
  if (!current) return { status: "missing" as const, updates };
  if ((operation.kind === "start" && current.sessionId === operation.operationId) ||
    (operation.kind === "save" && current.history.some((entry) => entry.id === operation.sessionId))) {
    return { status: "duplicate" as const, updates };
  }
  if (getStudySessionId(current) !== operation.sessionId) return { status: "conflict" as const, updates };
  if (operation.kind === "start") {
    const candidate = { ...current, isRunning: true, sessionStartTime: operation.at };
    const latest = getLatestRunningTask([...tasks.filter((task) => task.id !== current.id), candidate]);
    if (latest?.id !== current.id || current.isRunning) return { status: "conflict" as const, updates };
    tasks.filter((task) => task.isRunning && task.id !== current.id).forEach((task) => {
      updates.set(task.id, { ...getPausedTaskUpdates(task, operation.at), sessionId: getStudySessionId(task) });
    });
    updates.set(current.id, { isRunning: true, sessionStartTime: operation.at, sessionId: operation.operationId,
      lastActivityAt: operation.at, lastUpdatedAt: operation.at, sessionReviewFlags: [],
      status: current.status === "not_started" || current.status === "completed" ? "in_progress" : current.status });
  } else if (operation.kind === "pause") {
    if (!current.isRunning) return { status: "duplicate" as const, updates };
    updates.set(current.id, { ...getPausedTaskUpdates(current, operation.at), sessionId: operation.sessionId });
  } else {
    const duration = getElapsedSeconds(current, operation.at);
    if (duration <= 0) return { status: "duplicate" as const, updates };
    const reviewFlags = getSessionReviewFlags(duration, [...(current.sessionReviewFlags ?? []), ...(operation.reviewFlags ?? [])]);
    const entry = { id: operation.sessionId, date: new Date(operation.at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }),
      duration, memo: operation.memo ?? "", startAt: operation.at - duration * 1000, endAt: operation.at,
      creditedDuration: getCreditedStudyMinutes(duration, reviewFlags) * 60, reviewFlags };
    updates.set(current.id, { history: [...current.history, entry], currentDuration: 0, currentMemo: "", isRunning: false,
      sessionStartTime: null, sessionId: operation.sessionId, sessionReviewFlags: [], lastActivityAt: operation.at, lastUpdatedAt: operation.at,
      status: current.status === "not_started" ? "in_progress" : current.status });
  }
  return { status: "applied" as const, updates };
};

// family上の参照をSTARTの共通競合点にし、一覧取得後に作られた課題も再試行時に読む。
// STOP・履歴追加も同じdocument上でセッション照合して原子的に確定する。
export const commitStudySessionOperation = async (database: Firestore, tasksCollection: CollectionReference<DocumentData>, operation: StudySessionOperation) => {
  const target = doc(tasksCollection, operation.taskId);
  const refs = operation.kind === "start" ? (await getDocsFromServer(tasksCollection)).docs.map((item) => item.ref) : [target];
  if (!refs.some((ref) => ref.id === target.id)) refs.push(target);
  return runTransaction(database, async (transaction) => {
    const familyRef = tasksCollection.parent;
    if (!familyRef) throw new Error("Study tasks must belong to a family document");
    const familySnapshot = await transaction.get(familyRef);
    const activeTaskId = familySnapshot.data()?.activeStudyTaskId;
    const transactionRefs = [...refs];
    if (operation.kind === "start" && typeof activeTaskId === "string" && !transactionRefs.some((ref) => ref.id === activeTaskId)) transactionRefs.push(doc(tasksCollection, activeTaskId));
    const snapshots = await Promise.all(transactionRefs.map((ref) => transaction.get(ref)));
    const tasks = snapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => {
      const data = snapshot.data();
      const start = data.sessionStartTime;
      const activity = data.lastActivityAt;
      return { ...data, id: snapshot.id, status: data.status ?? "not_started", currentDuration: Number(data.currentDuration || 0), history: Array.isArray(data.history) ? data.history : [],
        sessionStartTime: start == null ? null : typeof start.toMillis === "function" ? start.toMillis() : Number(start),
        ...(activity == null ? {} : { lastActivityAt: typeof activity.toMillis === "function" ? activity.toMillis() : Number(activity) }),
      } as SessionTask;
    });
    const prepared = prepareStudySessionOperation(tasks, operation);
    if (prepared.status === "applied") {
      if (operation.kind === "start") transaction.set(familyRef, { activeStudyTaskId: operation.taskId }, { merge: true });
      else if (activeTaskId === operation.taskId) transaction.set(familyRef, { activeStudyTaskId: null }, { merge: true });
    }
    prepared.updates.forEach((updates, id) => {
      const safeUpdates = { ...updates };
      delete safeUpdates.pendingSync;
      transaction.update(doc(tasksCollection, id), safeUpdates);
    });
    return { status: prepared.status, tasks: tasks.map((task) => ({ ...task, ...prepared.updates.get(task.id), pendingSync: false })) };
  });
};

export const drainStudySessionOperations = async (
  readQueue: () => StudySessionOperation[],
  writeQueue: (operations: StudySessionOperation[]) => void,
  commit: (operation: StudySessionOperation) => ReturnType<typeof commitStudySessionOperation>,
  onResult: (operation: StudySessionOperation, result: Awaited<ReturnType<typeof commitStudySessionOperation>>, remaining: StudySessionOperation[]) => void,
) => {
  while (readQueue().length) {
    const operation = readQueue()[0];
    const result = await commit(operation);
    // 確定後だけ除去する。通信失敗時もIDと順序を保ち、応答喪失後の再送を冪等にする。
    const remaining = readQueue().filter((item) => item.operationId !== operation.operationId);
    writeQueue(remaining);
    onResult(operation, result, remaining);
  }
};
