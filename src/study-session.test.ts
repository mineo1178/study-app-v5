import { describe, expect, it } from "vitest";
import { createStudySessionOperation, drainStudySessionOperations, getStudySessionId, prepareStudySessionOperation, type SessionTask, type StudySessionOperation } from "./study-session";

const task = (overrides: Partial<SessionTask> = {}): SessionTask => ({ id: "a", unit: "第1回", subject: "math", status: "in_progress", currentDuration: 0, sessionStartTime: 1000, isRunning: true, sessionId: "session-a", history: [], ...overrides });
const operation = (kind: StudySessionOperation["kind"], overrides: Partial<StudySessionOperation> = {}): StudySessionOperation => ({ operationId: "op", taskId: "a", kind, sessionId: "session-a", at: 601000, ...overrides });
const apply = (tasks: SessionTask[], op: StudySessionOperation) => {
  const result = prepareStudySessionOperation(tasks, op);
  return { ...result, tasks: tasks.map((item) => ({ ...item, ...result.updates.get(item.id) })) };
};

describe("session operation guards", () => {
  it("rejects an old STOP against a new session without modifying any fields", () => {
    const result = apply([task({ sessionId: "new", sessionStartTime: 500000 })], operation("save"));
    expect(result.status).toBe("conflict");
    expect(result.updates.size).toBe(0);
  });
  it("rejects a delayed pause after resume", () => {
    const paused = apply([task()], operation("pause"));
    const resumed = apply(paused.tasks, operation("start", { operationId: "resume", at: 602000 }));
    expect(apply(resumed.tasks, operation("pause")).status).toBe("conflict");
    expect(resumed.tasks[0].sessionId).toBe("resume");
  });
  it("saves a session once, retaining the latest existing history", () => {
    const prior = { id: "prior", duration: 60 };
    const saved = apply([task({ history: [prior] })], operation("save"));
    expect(saved.tasks[0].history).toHaveLength(2);
    expect(saved.tasks[0].history[0]).toEqual(prior);
    expect(saved.tasks[0].history[1]).toMatchObject({ id: "session-a", duration: 600, creditedDuration: 600 });
    const retry = apply(saved.tasks, operation("save", { operationId: "another-request", at: 999000 }));
    expect(retry.status).toBe("duplicate");
    expect(retry.tasks).toEqual(saved.tasks);
  });
  it("does not reset a new session when an already-saved STOP is replayed", () => {
    const saved = apply([task()], operation("save"));
    const next = apply(saved.tasks, operation("start", { operationId: "new", at: 602000 }));
    const retry = apply(next.tasks, operation("save"));
    expect(retry.status).toBe("duplicate");
    expect(retry.tasks[0]).toMatchObject({ sessionId: "new", isRunning: true });
  });
  it("pauses all older tasks atomically with START and retains their session identities", () => {
    const b = task({ id: "b", sessionId: "b-old", isRunning: false, sessionStartTime: null, currentDuration: 20 });
    const result = apply([task(), b], operation("start", { taskId: "b", sessionId: "b-old", operationId: "new", at: 601000 }));
    expect(result.tasks.filter((item) => item.isRunning).map((item) => item.id)).toEqual(["b"]);
    expect(result.tasks[0]).toMatchObject({ currentDuration: 600, sessionId: "session-a", isRunning: false });
    expect(result.tasks[1]).toMatchObject({ currentDuration: 20, sessionId: "new" });
  });
  it("rejects a delayed START behind a newer active task", () => {
    const result = apply([task({ isRunning: false, sessionStartTime: null }), task({ id: "b", sessionId: "b", sessionStartTime: 700000 })], operation("start"));
    expect(result.status).toBe("conflict");
    expect(result.updates.size).toBe(0);
  });
  it("makes a START replay a no-op even after the session was saved", () => {
    const started = apply([task({ isRunning: false, sessionStartTime: null })], operation("start"));
    const saved = apply(started.tasks, operation("save", { sessionId: "op", at: 1201000 }));
    expect(apply(saved.tasks, operation("start")).status).toBe("duplicate");
  });
  it("uses a deterministic identity for legacy data and persists it on pause", () => {
    const legacy = task({ sessionId: undefined });
    const id = getStudySessionId(legacy);
    const paused = apply([legacy], operation("pause", { sessionId: id }));
    expect(getStudySessionId(paused.tasks[0])).toBe(id);
    expect(apply(paused.tasks, operation("save", { sessionId: id })).status).toBe("applied");
  });
  it("keeps a legacy paused session identity across memo or status updates", () => {
    const paused = task({ sessionId: undefined, isRunning: false, sessionStartTime: null, currentDuration: 600 });
    expect(getStudySessionId({ ...paused, lastUpdatedAt: 999999, currentMemo: "changed", status: "completed" })).toBe(getStudySessionId(paused));
  });
  it("retains short-session, review and maximum-credit rules", () => {
    expect(apply([task()], operation("save", { at: 300000 })).tasks[0].history[0].creditedDuration).toBe(0);
    expect(apply([task()], operation("save", { reviewFlags: ["long_background"] })).tasks[0].history[0].creditedDuration).toBe(0);
    expect(apply([task()], operation("save", { at: 5401000 })).tasks[0].history[0].creditedDuration).toBe(3600);
  });
  it("generates independent operation IDs without changing the observed session identity", () => {
    const a = createStudySessionOperation(task(), "save");
    const b = createStudySessionOperation(task(), "save");
    expect(a.operationId).not.toBe(b.operationId);
    expect(a.sessionId).toBe(b.sessionId);
  });
  it("counts paused and resumed segments once under the resumed identity", () => {
    const paused = apply([task()], operation("pause"));
    const resumed = apply(paused.tasks, operation("start", { operationId: "resume", at: 602000 }));
    const saved = apply(resumed.tasks, operation("save", { sessionId: "resume", at: 1202000 }));
    expect(saved.tasks[0].history).toEqual([expect.objectContaining({ id: "resume", duration: 1200, creditedDuration: 1200 })]);
  });
  it("keeps queue IDs and order on communication failure and handles new entries while draining", async () => {
    const first = operation("pause");
    const second = operation("save", { operationId: "second" });
    let queue = [first];
    await expect(drainStudySessionOperations(() => queue, (value) => { queue = value; }, async () => { throw new Error("offline"); }, () => {})).rejects.toThrow("offline");
    expect(queue).toEqual([first]);
    const applied: string[] = [];
    await drainStudySessionOperations(() => queue, (value) => { queue = value; }, async (op) => {
      if (op.operationId === first.operationId) queue = [...queue, second];
      applied.push(op.operationId);
      return { status: "duplicate", tasks: [] };
    }, () => {});
    expect(applied).toEqual([first.operationId, second.operationId]);
    expect(queue).toEqual([]);
  });
});
