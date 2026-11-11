import { describe, expect, it } from "vitest";
import { answerQuestion, createReviewDraft, nextProgress, restoreDraft, sampleQuestions } from "./model";
import { dailyReviewSelection, practiceSelection, type TargetPlan } from "./target-plan";
const at=Date.parse("2026-11-11T12:00:00+09:00");
describe("additional practice",()=>{
  it("starts when all spaced reviews are early, preserving their schedule",()=>{
    const d=answerQuestion(createReviewDraft("u",[sampleQuestions[0]],"daily",at-86400000),sampleQuestions[0].correctIndex,at-86400000+100);
    const p=nextProgress(undefined,d.answers[0]), before=structuredClone(p);
    expect(dailyReviewSelection([sampleQuestions[0]],[p],null,at).selected).toHaveLength(0);
    const selected=practiceSelection([sampleQuestions[0]],[],null,at);
    const practice=answerQuestion(createReviewDraft("u",selected,"practice",at),0,at+100);
    expect(practice.answers[0].mode).toBe("practice");
    expect(()=>nextProgress(p,practice.answers[0])).toThrow(); expect(p).toEqual(before);
    expect(restoreDraft(JSON.stringify(practice),"u")).toEqual(practice);
  });
  it("prioritizes valid plan versions and falls back to general practice",()=>{
    const plan:TargetPlan={schemaVersion:1,label:"test",testDay:"2026-11-15",items:[{questionId:sampleQuestions[0].id,questionVersion:sampleQuestions[0].version,priority:1,reason:"fixture",evidence:"fixture",scopeBasis:"fixture"}],gaps:[],notes:[]};
    expect(practiceSelection(sampleQuestions,[],plan,at)[0].id).toBe(sampleQuestions[0].id);
    expect(practiceSelection([],[],null,at)).toEqual([]);
    expect(practiceSelection(sampleQuestions.slice(0,2),[],null,at)).toHaveLength(2);
  });
  it("rotates across JST days while staying deterministic on reload",()=>{
    const pool=Array.from({length:12},(_,i)=>({...sampleQuestions[0],id:'q'+i}));
    const a=practiceSelection(pool,[],null,at);
    expect(practiceSelection(pool,[],null,at+1000)).toEqual(a);
    expect(practiceSelection(pool,[],null,at+86400000)).not.toEqual(a);
  });
});
