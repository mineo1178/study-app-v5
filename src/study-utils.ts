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
