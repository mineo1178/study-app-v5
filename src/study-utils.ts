export type StudyStatus = "not_started" | "in_progress" | "completed";

export type StudyHistoryEntry = {
  duration: number;
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
