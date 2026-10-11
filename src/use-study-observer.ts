import { useEffect, type MutableRefObject } from "react";
import { createStudySessionOperation, prepareStudySessionOperation, type SessionTask, type StudySessionOperation } from "./study-session";
import { getIdleDeadline, USER_ACTIVITY_EVENTS } from "./study-idle";

// Lives above individual timer cards so tab switches and collapsed tasks stay observed.
export const useStudyObserver = <T extends SessionTask>(
  tasksRef: MutableRefObject<T[]>,
  apply: (id: string, updates: Partial<T>) => void,
  sync: (id: string, updates: { __studyOperation: StudySessionOperation }) => void,
) => {
  useEffect(() => {
    const submit = (task: T, operation: StudySessionOperation) => {
      const result = prepareStudySessionOperation([task], operation);
      const updates = result.updates.get(task.id);
      if (!updates) return;
      apply(task.id, { ...updates, pendingSync: true } as Partial<T>);
      sync(task.id, { __studyOperation: operation });
    };
    const check = () => {
      const now = Date.now();
      tasksRef.current.filter((task) => task.isRunning).forEach((task) => {
        if (document.hidden && task.hiddenSince == null) {
          submit(task, { ...createStudySessionOperation(task, "observe", now), visibility: "hidden" });
        }
        if (!document.hidden && task.hiddenSince != null) {
          submit(task, { ...createStudySessionOperation(task, "observe", now), visibility: "visible" });
        }
        if (task.lastUserActivityAt === undefined) {
          submit(task, { ...createStudySessionOperation(task, "observe", now), lastUserActivityAt: task.sessionStartTime ?? now });
        } else if (now >= getIdleDeadline(task)) {
          submit(task, { ...createStudySessionOperation(task, "save", now), reviewReasons: ["idle"] });
        }
      });
    };
    const activity = () => {
      check();
      const now = Date.now();
      tasksRef.current.filter((task) => task.isRunning && task.lastUserActivityAt !== now).forEach((task) => {
        submit(task, { ...createStudySessionOperation(task, "observe", now), lastUserActivityAt: now });
      });
    };
    const visibility = (hidden: boolean) => {
      const now = Date.now();
      tasksRef.current.filter((task) => task.isRunning).forEach((task) => {
        submit(task, { ...createStudySessionOperation(task, "observe", now), visibility: hidden ? "hidden" : "visible" });
      });
      check();
    };
    const onVisibility = () => visibility(document.hidden);
    const onHide = () => visibility(true);
    const onShow = () => visibility(document.hidden);
    USER_ACTIVITY_EVENTS.forEach((event) => document.addEventListener(event, activity, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, 1000);
    return () => {
      USER_ACTIVITY_EVENTS.forEach((event) => document.removeEventListener(event, activity, true));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, [tasksRef, apply, sync]);
};
