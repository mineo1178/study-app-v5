export const STUDY_IDLE_MS = 15 * 60 * 1000;
export const BACKGROUND_REVIEW_MS = 5 * 60 * 1000;
export const USER_ACTIVITY_EVENTS = ["pointerdown", "click", "keydown", "touchstart", "wheel"] as const;
export type ReviewReason = "idle" | "background";
export type StudyObservation = {
  lastUserActivityAt?: number;
  hiddenSince?: number | null;
  backgroundReviewRequired?: boolean;
};

export const getIdleDeadline = (task: StudyObservation & { sessionStartTime: number | null }) =>
  (task.lastUserActivityAt ?? task.sessionStartTime ?? 0) + STUDY_IDLE_MS;

export const getStudyStopReview = (task: StudyObservation & { isRunning: boolean; sessionStartTime: number | null }, at: number) => {
  // Legacy sessions acquire a persisted activity baseline through the observer first.
  const idle = task.isRunning && task.lastUserActivityAt !== undefined && at >= getIdleDeadline(task);
  const endAt = idle ? getIdleDeadline(task) : at;
  const background = task.backgroundReviewRequired || (task.hiddenSince != null && at - task.hiddenSince >= BACKGROUND_REVIEW_MS);
  return { endAt, reasons: [...(idle ? ["idle" as const] : []), ...(background ? ["background" as const] : [])] };
};
