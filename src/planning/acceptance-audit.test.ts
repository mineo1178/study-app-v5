import { describe, expect, it } from "vitest";
import { correctRangeInputs, emptyPlan, progressOf, validatePlanTransition, type PlanRange, type TaskPlan } from "./model";
const range:PlanRange={id:'range',label:'1〜5ページ',units:5,minutes:10,day:'2026-11-11',done:true,graded:true,corrected:false,actualDay:'2026-11-11',actualSeconds:60};
const baseline={id:'b1',createdDay:'2026-11-11',targetDay:'2026-11-12',daily:{'2026-11-12':100},evidence:{source:'fixture',count:0,firstSeconds:null,redoSeconds:null,redoDays:0,conditions:'fixture',manualMinutes:10,provisional:true}};
const old:TaskPlan={...emptyPlan(),ranges:[range],baseline};
describe('acceptance audit: fixed-baseline input correction',()=>{
 it('archives the exact baseline and old quantities while preserving IDs and actuals',()=>{
  const next=correctRangeInputs(old,[{...range,label:'1〜6ページ',units:6,minutes:12}],'入力ミスの訂正','c1','2026-11-11');
  expect(next.baseline).toBeNull();expect(next.baselineHistory).toEqual([baseline]);expect(next.rangeCorrections?.[0].previousRanges).toEqual([range]);expect(next.ranges[0]).toMatchObject({id:range.id,done:true,graded:true,corrected:false,actualDay:range.actualDay,actualSeconds:60});
  expect(()=>validatePlanTransition(old,next)).not.toThrow();expect(old.ranges[0].units).toBe(5);
 });
 it('rejects silent weight changes, baseline removal and tampered correction history',()=>{
  expect(()=>validatePlanTransition(old,{...old,ranges:[{...range,units:6}]})).toThrow();
  expect(()=>validatePlanTransition(old,{...old,baseline:null,baselineHistory:[baseline]})).toThrow();
  const next=correctRangeInputs(old,[{...range,units:6}],'理由','c1','2026-11-11');
  expect(()=>validatePlanTransition(old,{...next,ranges:[{...next.ranges[0],done:false}]})).toThrow();
  expect(()=>correctRangeInputs(old,[{...range,id:'new'}],'理由','c1','2026-11-11')).toThrow();
  expect(()=>correctRangeInputs(old,[{...range,units:6}],'','c1','2026-11-11')).toThrow();
 });
 it('preserves legacy completed status even if partial range records were introduced later',()=>{
  expect(progressOf({id:'old',unit:'11',subject:'math',category:'book',materialName:'book',title:'old',status:'completed',isRunning:false,history:[],planning:old})).toBe(100);
 });
});
