export type StudyStatus = "not_started" | "in_progress" | "completed";

export type SessionReviewFlag =
  | "long_session"
  | "long_background"
  | "clock_changed";

export const MIN_CREDITED_STUDY_SECONDS = 10 * 60;
export const MAX_CREDITED_STUDY_SECONDS = 60 * 60;
export const LONG_SESSION_SECONDS = 120 * 60;
export const LONG_BACKGROUND_SECONDS = 30 * 60;

export type StudyHistoryEntry = {
  duration: number;
  date?: string;
  startAt?: number;
  endAt?: number;
  creditedDuration?: number;
  reviewFlags?: SessionReviewFlag[];
};

export type StudyTaskLike = {
  id: string;
  unit: string;
  subject: string;
  status: StudyStatus;
  currentDuration: number;
  sessionStartTime: number | null;
  isRunning: boolean;
  history: StudyHistoryEntry[];
};

export const getElapsedSeconds = (
  task: Pick<
    StudyTaskLike,
    "currentDuration" | "sessionStartTime" | "isRunning"
  >,
  now = Date.now(),
) => {
  if (!task.isRunning || task.sessionStartTime === null) return task.currentDuration;
  return task.currentDuration + Math.max(0, Math.floor((now - task.sessionStartTime) / 1000));
};

// 未送信の操作だけを保護し、同期済みの表示状態はクラウドの操作に従う。
export const mergeSyncedTasks = <T extends { id: string; pendingSync?: boolean }>(localTasks: T[], cloudTasks: T[]): T[] => {
  const localById = new Map(localTasks.map((task) => [task.id, task]));
  const cloudIds = new Set(cloudTasks.map((task) => task.id));
  return [
    ...cloudTasks.map((cloud) => {
      const local = localById.get(cloud.id);
      return local?.pendingSync ? local : cloud;
    }),
    ...localTasks.filter((task) => !cloudIds.has(task.id) && task.pendingSync),
  ];
};

export const subscribeTimerVisibility = (
  target: EventTarget & { readonly hidden: boolean },
  task: StudyTaskLike,
  onResume: (seconds: number) => void,
  onLongBackground: () => void,
  hiddenAt: { current: number | null } = { current: null },
) => {
  if (target.hidden && task.isRunning) hiddenAt.current ??= Date.now();
  const handleVisibility = () => {
    if (!task.isRunning) return;
    if (target.hidden) {
      hiddenAt.current ??= Date.now();
    } else {
      if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= LONG_BACKGROUND_SECONDS * 1000) onLongBackground();
      hiddenAt.current = null;
      onResume(getElapsedSeconds(task));
    }
  };
  target.addEventListener("visibilitychange", handleVisibility);
  return () => target.removeEventListener("visibilitychange", handleVisibility);
};

// 更新時刻は表示のheartbeatでも変わるため、排他制御は開始時刻で決める。
export const getLatestRunningTask = <T extends Pick<StudyTaskLike, "id" | "isRunning" | "sessionStartTime">>(tasks: T[]) =>
  tasks.filter((task) => task.isRunning && task.sessionStartTime !== null)
    .sort((a, b) => (b.sessionStartTime ?? 0) - (a.sessionStartTime ?? 0) || a.id.localeCompare(b.id))[0];

export const getPausedTaskUpdates = (task: StudyTaskLike, now: number) => ({
  isRunning: false,
  currentDuration: getElapsedSeconds(task, now),
  sessionStartTime: null,
  lastActivityAt: now,
  lastUpdatedAt: now,
  pendingSync: true,
});

export const getDuplicateTimerUpdates = (tasks: StudyTaskLike[], now: number) => {
  const latest = getLatestRunningTask(tasks);
  return tasks.filter((task) => task.isRunning && task.sessionStartTime !== null && task.id !== latest?.id)
    .map((task) => ({ id: task.id, updates: getPausedTaskUpdates(task, now) }));
};

export const getCreditedStudyMinutes = (
  recordedDuration: number,
  reviewFlags: SessionReviewFlag[] = [],
) => {
  if (recordedDuration < MIN_CREDITED_STUDY_SECONDS || reviewFlags.length > 0)
    return 0;
  return Math.floor(Math.min(recordedDuration, MAX_CREDITED_STUDY_SECONDS) / 60);
};

export const getSessionReviewFlags = (
  recordedDuration: number,
  flags: SessionReviewFlag[] = [],
) =>
  Array.from(
    new Set([
      ...flags,
      ...(recordedDuration >= LONG_SESSION_SECONDS
        ? (["long_session"] as SessionReviewFlag[])
        : []),
    ]),
  );

export const getStudyDuration = (task: StudyTaskLike) =>
  task.currentDuration + task.history.reduce((total, entry) => total + entry.duration, 0);

export const getTaskStats = (tasks: StudyTaskLike[]) => {
  if (tasks.length === 0) return { progress: 0, totalTime: 0 };

  const completed = tasks.filter((task) => task.status === "completed").length;
  return {
    progress: Math.round((completed / tasks.length) * 100),
    totalTime: tasks.reduce((total, task) => total + getStudyDuration(task), 0),
  };
};

export const getSubjectTaskStats = (tasks: StudyTaskLike[], subject: string) =>
  getTaskStats(tasks.filter((task) => task.subject === subject));

export const removeTasksForUnit = <T extends Pick<StudyTaskLike, "unit">>(
  tasks: T[],
  unit: string,
) => tasks.filter((task) => task.unit !== unit);
