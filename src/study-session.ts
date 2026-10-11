import { doc, getDocFromServer, getDocsFromServer, runTransaction, type CollectionReference, type DocumentData, type Firestore } from "firebase/firestore";
import { getCreditedStudyMinutes, getElapsedSeconds, getLatestRunningTask, getPausedTaskUpdates, getSessionReviewFlags, type SessionReviewFlag, type StudyTaskLike } from "./study-utils";
import { BACKGROUND_REVIEW_MS, getStudyStopReview, type ReviewReason, type StudyObservation } from "./study-idle";

export type SessionTask = Omit<StudyTaskLike, "history"> & StudyObservation & {
  sessionId?: string;
  pendingSync?: boolean;
  lastActivityAt?: number;
  lastUpdatedAt?: number;
  currentMemo?: string;
  sessionReviewFlags?: SessionReviewFlag[];
  sessionReviewReasons?: ReviewReason[];
  history: (StudyTaskLike["history"][number] & { id?: string; memo?: string })[];
};
export type StudySessionOperation = {
  operationId: string;
  taskId: string;
  kind: "start" | "pause" | "save" | "observe" | "confirm";
  sessionId: string;
  at: number;
  memo?: string;
  reviewFlags?: SessionReviewFlag[];
  lastUserActivityAt?: number;
  visibility?: "hidden" | "visible";
  confirmedDurationSeconds?: number;
  reviewReasons?: ReviewReason[];
};
export const getStudySessionId = (task: SessionTask) => task.sessionId ||
  `legacy-${task.id}-${task.sessionStartTime ?? task.lastActivityAt ?? `paused-${task.currentDuration}-${task.history.length}-${task.history.at(-1)?.id ?? "none"}`}`;

export const createStudySessionOperation = (task: SessionTask, kind: StudySessionOperation["kind"], at = Date.now()): StudySessionOperation => ({
  operationId: crypto.randomUUID(), taskId: task.id, kind, sessionId: getStudySessionId(task), at,
  memo: task.currentMemo ?? "", reviewFlags: task.sessionReviewFlags ?? [],
});

const getObservedReviewFlags = (task: SessionTask, at: number, extra: SessionReviewFlag[] = []) =>
  getSessionReviewFlags(getElapsedSeconds(task, at), [...(task.sessionReviewFlags ?? []), ...extra,
    ...(task.hiddenSince != null && at - task.hiddenSince >= 30 * 60 * 1000 ? ["long_background" as const] : [])]);

export const prepareStudySessionOperation = (tasks: SessionTask[], operation: StudySessionOperation) => {
  const current = tasks.find((task) => task.id === operation.taskId);
  const updates = new Map<string, Partial<SessionTask>>();
  if (!current) return { status: "missing" as const, updates };
  if (operation.kind === "confirm") {
    const entry = current.history.find((item) => item.id === operation.sessionId);
    if (!entry) return { status: "missing" as const, updates };
    if (entry.reviewStatus !== "pending") return { status: "duplicate" as const, updates };
    const seconds = operation.confirmedDurationSeconds;
    if (seconds === undefined || !Number.isInteger(seconds) || seconds < 0 || seconds > entry.duration) return { status: "conflict" as const, updates };
    const reviewFlags = getSessionReviewFlags(seconds, entry.reviewFlags ?? []);
    updates.set(current.id, { history: current.history.map((item) => item.id === entry.id ? {
      ...item, recordedDuration: item.recordedDuration ?? item.duration, duration: seconds,
      ...(item.endAt === undefined ? {} : { startAt: item.endAt - seconds * 1000 }),
      confirmedDurationSeconds: seconds, reviewStatus: "confirmed", reviewFlags,
      creditedDuration: getCreditedStudyMinutes(seconds, reviewFlags) * 60,
    } : item) });
    return { status: "applied" as const, updates };
  }
  if ((operation.kind === "start" && current.sessionId === operation.operationId) ||
    (operation.kind === "save" && current.history.some((entry) => entry.id === operation.sessionId))) {
    return { status: "duplicate" as const, updates };
  }
  if (getStudySessionId(current) !== operation.sessionId) return { status: "conflict" as const, updates };
  if (operation.kind === "observe") {
    if (!current.isRunning) return { status: "duplicate" as const, updates };
    const observation: Partial<SessionTask> = {};
    if (operation.lastUserActivityAt !== undefined) {
      const baseline = current.lastUserActivityAt ?? current.sessionStartTime ?? operation.at;
      // An overdue operation cannot resurrect a timer before it is reviewed.
      if (operation.lastUserActivityAt >= baseline + 15 * 60 * 1000) return { status: "conflict" as const, updates };
      observation.lastUserActivityAt = Math.max(baseline, operation.lastUserActivityAt);
    }
    if (operation.visibility === "hidden") observation.hiddenSince = current.hiddenSince ?? operation.at;
    if (operation.visibility === "visible") {
      observation.backgroundReviewRequired = !!current.backgroundReviewRequired || (current.hiddenSince != null && operation.at - current.hiddenSince >= BACKGROUND_REVIEW_MS);
      observation.hiddenSince = null;
      if (current.hiddenSince != null && operation.at - current.hiddenSince >= 30 * 60 * 1000) observation.sessionReviewFlags = Array.from(new Set([...(current.sessionReviewFlags ?? []), "long_background"]));
    }
    updates.set(current.id, observation);
    return { status: "applied" as const, updates };
  }
  if (operation.kind === "start") {
    const candidate = { ...current, isRunning: true, sessionStartTime: operation.at };
    const latest = getLatestRunningTask([...tasks.filter((task) => task.id !== current.id), candidate]);
    if (latest?.id !== current.id || current.isRunning) return { status: "conflict" as const, updates };
    tasks.filter((task) => task.isRunning && task.id !== current.id).forEach((task) => {
      const stop = getStudyStopReview(task, operation.at);
      updates.set(task.id, { ...getPausedTaskUpdates(task, stop.endAt), sessionId: getStudySessionId(task), hiddenSince: null,
        sessionReviewFlags: getObservedReviewFlags(task, operation.at),
        sessionReviewReasons: Array.from(new Set([...(task.sessionReviewReasons ?? []), ...stop.reasons])),
        backgroundReviewRequired: stop.reasons.includes("background") });
    });
    updates.set(current.id, { isRunning: true, sessionStartTime: operation.at, sessionId: operation.operationId,
      lastActivityAt: operation.at, lastUpdatedAt: operation.at, lastUserActivityAt: operation.at, hiddenSince: null,
      backgroundReviewRequired: current.currentDuration > 0 && !!current.backgroundReviewRequired,
      sessionReviewFlags: current.currentDuration > 0 ? current.sessionReviewFlags ?? [] : [],
      sessionReviewReasons: current.currentDuration > 0 ? current.sessionReviewReasons ?? [] : [],
      status: current.status === "not_started" || current.status === "completed" ? "in_progress" : current.status });
  } else if (operation.kind === "pause") {
    if (!current.isRunning) return { status: "duplicate" as const, updates };
    const stop = getStudyStopReview(current, operation.at);
    updates.set(current.id, { ...getPausedTaskUpdates(current, stop.endAt), sessionId: operation.sessionId,
      sessionReviewFlags: getObservedReviewFlags(current, operation.at, operation.reviewFlags),
      sessionReviewReasons: Array.from(new Set([...(current.sessionReviewReasons ?? []), ...stop.reasons])),
      backgroundReviewRequired: stop.reasons.includes("background"), hiddenSince: null });
  } else {
    const stop = getStudyStopReview(current, operation.at);
    if (operation.reviewReasons?.includes("idle") && !stop.reasons.includes("idle")) return { status: "conflict" as const, updates };
    const duration = getElapsedSeconds(current, stop.endAt);
    if (duration <= 0) return { status: "duplicate" as const, updates };
    const reviewFlags = getObservedReviewFlags(current, operation.at, operation.reviewFlags);
    const reasons = Array.from(new Set([...stop.reasons, ...(current.sessionReviewReasons ?? []), ...(operation.reviewReasons ?? [])]));
    const entry = { id: operation.sessionId, date: new Date(stop.endAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }),
      duration, memo: operation.memo ?? "", startAt: stop.endAt - duration * 1000, endAt: stop.endAt,
      reviewStatus: reasons.length ? "pending" as const : "not_required" as const, reviewReasons: reasons,
      creditedDuration: reasons.length ? 0 : getCreditedStudyMinutes(duration, reviewFlags) * 60, reviewFlags };
    updates.set(current.id, { history: [...current.history, entry], currentDuration: 0, currentMemo: "", isRunning: false,
      sessionStartTime: null, sessionId: operation.sessionId, sessionReviewFlags: [], sessionReviewReasons: [], hiddenSince: null, backgroundReviewRequired: false, lastActivityAt: operation.at, lastUpdatedAt: operation.at,
      status: current.status === "not_started" ? "in_progress" : current.status });
  }
  return { status: "applied" as const, updates };
};

// family上の参照をSTARTの共通競合点にし、一覧取得後に作られた課題も再試行時に読む。
// STOP・履歴追加も同じdocument上でセッション照合して原子的に確定する。
export const commitStudySessionOperation = async (database: Firestore, tasksCollection: CollectionReference<DocumentData>, operation: StudySessionOperation) => {
  const target = doc(tasksCollection, operation.taskId);
  if (operation.kind === "confirm") await getDocFromServer(target);
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
      else if ((operation.kind === "save" || operation.kind === "pause") && activeTaskId === operation.taskId) transaction.set(familyRef, { activeStudyTaskId: null }, { merge: true });
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
