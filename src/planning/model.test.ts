import { createStudySessionOperation, prepareStudySessionOperation, type SessionTask } from "../study-session";
import { describe, expect, it } from "vitest";
import { addDays, aggregate, dailyWork, difference, emptyPlan, makeBaseline, monday, progressOf, validatePlan, type PlanningTask, type PlanRange } from "./model";
import { calculationEvidence, studyTargetAverage, targetAverage } from "./target-time";
const range = (id: string, overrides: Partial<PlanRange> = {}): PlanRange => ({ id, label: id, units: 5, minutes: 10, day: "2026-11-11", done: false, graded: false, corrected: false, actualDay: null, actualSeconds: null, ...overrides });
const task = (id: string, overrides: Partial<PlanningTask> = {}): PlanningTask => ({ id, unit: "第11回", subject: "math", category: "練習", materialName: "教材", title: "範囲", status: "in_progress", isRunning: false, history: [], ...overrides });
describe("task-linked learning plans", () => {
  it("does not guess progress for legacy states, and recognizes legacy completion", () => {
    expect(progressOf(task("old"))).toBeNull();
    expect(progressOf(task("done", { status: "completed" }))).toBe(100);
    expect(aggregate([task("old")])).toBeNull();
  });
  it("counts only measured ranges with grading and corrections complete", () => {
    const plan = { ...emptyPlan(), ranges: [range("a", { done: true, graded: true, corrected: true }), range("b", { done: true })] };
    const t = task("a", { planning: plan });
    expect(progressOf(t)).toBe(50); expect(t.status).toBe("in_progress");
    expect(dailyWork(plan)).toEqual({ "2026-11-11": 100 });
    expect(difference(50, dailyWork(plan), "2026-11-11")).toEqual({ expected: 100, points: -50 });
    expect(difference(null, dailyWork(plan), "2026-11-11")).toBeNull();
    expect(difference(50, {}, "2026-11-11")).toBeNull();
    expect(difference(50, { "2026-11-12": 100 }, "2026-11-11")?.points).toBe(50);
  });
  it("weights parents by fixed planned minutes and excludes incomplete weights", () => {
    const a = task("a", { status: "completed", planning: { ...emptyPlan(), ranges: [range("x", { minutes: 30 })] } });
    const b = task("b", { planning: { ...emptyPlan(), ranges: [range("y")] } });
    expect(aggregate([a,b])).toBe(75);
    expect(aggregate([a,task("missing")])).toBeNull();
  });
  it("keeps task identity and manual due dates separate from immutable baseline", () => {
    const t = task("a", { planning: { ...emptyPlan(), ranges: [range("x")] } });
    const baseline = makeBaseline(t, [t], { "2026-11-11": 15, "2026-11-12": 15 }, [], "2026-11-11", "baseline-1", 30);
    expect(baseline.targetDay).toBe("2026-11-12"); expect(baseline.evidence.provisional).toBe(true);
    const changed = { ...t.planning!, endDay: "2026-12-01", baseline };
    expect(changed.baseline.targetDay).toBe("2026-11-12");
    expect(Object.values(baseline.daily).reduce((a,b)=>a+b,0)).toBeCloseTo(100);
    const next = makeBaseline(t, [t], { "2026-11-13": 60 }, [], "2026-11-11", "baseline-2", 40);
    expect({ ...changed, baseline: next, baselineHistory: [baseline] }.baselineHistory[0]).toEqual(baseline);
  });
  it("uses graded same-task history and keeps ungraded, pending, zero durations out", () => {
    const t = task("a", { planning: { ...emptyPlan(), ranges: [range("x")] }, history: [
      { duration: 600, score: 0, attemptType: "first", units: 5 },
      { duration: 60, graded: true, attemptType: "redo", units: 5, endAt: Date.parse("2026-11-10") },
      { duration: 6000, attemptType: "first", units: 5 },
      { duration: 6000, graded: true, reviewStatus: "pending", attemptType: "first", units: 5 },
      { duration: 6000, graded: true, operationCheck: true, attemptType: "first", units: 5 },
    ] });
    const b=makeBaseline(t,[t], { "2026-11-11": 10, "2026-11-12": 10 }, [], "2026-11-11", "b", null);
    expect(b.evidence.count).toBe(2); expect(b.evidence.firstSeconds).toBe(600);
    expect(b.evidence.redoSeconds).toBe(60); expect(b.targetDay).toBe("2026-11-12");
    expect(b.evidence.source).toBe("同一taskId");
  });
  it("uses elapsed calendar days for correction history instead of counting study dates", () => {
    const t=task('span',{planning:{...emptyPlan(),ranges:[range('r')]},history:[{duration:60,graded:true,attemptType:'first',units:5,endAt:Date.parse('2026-11-01T12:00:00+09:00')},{duration:60,graded:true,attemptType:'redo',units:5,endAt:Date.parse('2026-11-05T12:00:00+09:00')}]});
    expect(makeBaseline(t,[t],{'2026-11-11':10,'2026-11-15':10},[],'2026-11-11','span',null).evidence.redoDays).toBe(4);
  });
  it("subtracts other tasks and does not invent available time", () => {
    const t = task("a"), other=task("b", { planning:{ ...emptyPlan(), ranges:[range("b",{minutes:10})] } });
    expect(makeBaseline(t,[t],{},[],"2026-11-11","b",10).targetDay).toBeNull();
    expect(makeBaseline(t,[t],{"2026-11-11":10,"2026-11-12":10},[other],"2026-11-11","b",10).targetDay).toBe("2026-11-12");
  });
  it("validates ranges and JST/calendar boundaries", () => {
    expect(monday("2027-01-03")).toBe("2026-12-28"); expect(addDays("2026-12-31",1)).toBe("2027-01-01");
    expect(() => validatePlan({...emptyPlan(),ranges:[range("x"),range("x")]})).toThrow();
    expect(() => validatePlan({...emptyPlan(),ranges:[range("x",{units:0})]})).toThrow();
    expect(() => validatePlan({...emptyPlan(),endDay:"2026-02-30"})).toThrow();
  });
});
describe("target time evidence", () => {
  it("classifies first/redo per task and day without changing the legacy day sequence", () => {
    const rows = [{id:'a',taskId:'a',dateKey:'2026-11-11',attemptNo:1,attemptType:'first' as const,maxScore:7 as const,createdAt:0,elapsedSeconds:60,score:0,startedAt:0,finishedAt:60000},{id:'b',taskId:'b',dateKey:'2026-11-11',attemptNo:2,attemptType:'redo' as const,maxScore:7 as const,createdAt:0,elapsedSeconds:90,score:0,startedAt:0,finishedAt:90000}];
    expect(calculationEvidence(rows).map(r=>r.attemptType)).toEqual(['first','first']);
    expect(rows[1].attemptType).toBe('redo');
  });
  const row={taskId:"a", taskLabel:"11/計算1",elapsedSeconds:60,score:0,maxScore:7,attemptType:"first" as const,startedAt:0,finishedAt:60000};
  it("counts scored zero and separates first and redo", () => {
    expect(targetAverage([row,{...row,elapsedSeconds:120}],"a",row.taskLabel,"first")).toMatchObject({seconds:90,count:2,provisional:false});
    expect(targetAverage([row],"a",row.taskLabel,"redo")).toMatchObject({seconds:300,count:0,provisional:true});
    expect(targetAverage([{...row,practice:true}],"a",row.taskLabel,"first").count).toBe(0);
  });
  it("filters generic study records by grading, mode, units, and operation checks", () => {
    expect(studyTargetAverage([{duration:90,graded:true,attemptType:"first",units:5},{duration:999,graded:false,attemptType:"first",units:5}],"first",5)).toMatchObject({seconds:90,count:1});
    expect(studyTargetAverage([{duration:90,graded:true,attemptType:"redo",units:5}],"first",5).provisional).toBe(true);
  });
});

describe('study timer metadata snapshots',()=>{
 it('saves target separately from elapsed and preserves grade/mode/workload with idempotent save',()=>{
  const t:SessionTask={id:'timer',unit:'11',subject:'math',status:'not_started',currentDuration:0,sessionStartTime:null,isRunning:false,history:[],targetSeconds:90,timerMode:'first',timerUnits:7,timerGraded:true};
  const start=createStudySessionOperation(t,'start',1000),updates=prepareStudySessionOperation([t],start).updates.get(t.id)!;const running={...t,...updates};const save=createStudySessionOperation(running,'save',61000);const result=prepareStudySessionOperation([running],save);const final={...running,...result.updates.get(t.id)};
  expect(final.history[0]).toMatchObject({duration:60,targetSeconds:90,graded:true,attemptType:'first',units:7});expect(prepareStudySessionOperation([final],save).status).toBe('duplicate');
 });
});
