import {it,expect} from 'vitest';
import {completionPercent,dashboardFacts} from './dashboard';
import {scheduleTask,scheduleFixture} from '../../tests/schedule-fixture';
import {editWbs} from './wbs';

it('counts only completed status, deduplicates IDs and rounds parent counts',()=>{
 const tasks=Array.from({length:91},(_,i)=>({...scheduleTask,id:String(i),status:i<13?'completed' as const:'in_progress' as const}));
 tasks[13].planning=editWbs(tasks[13],{startDay:'',endDay:'',progress:100},'p',1);
 const before=JSON.stringify(tasks),result=dashboardFacts([...tasks,tasks[0]],null,'2026-11-13');
 expect(result.percent).toBe(14);expect(result.counts).toMatchObject({completed:13,total:91,inProgress:78});
 expect(completionPercent(3,45)).toBe(7);expect(completionPercent(0,0)).toBe(0);expect(JSON.stringify(tasks)).toBe(before);
});
it('uses adopted unfinished end dates and keeps missing measurements distinct',()=>{
 const plan=scheduleFixture(),r=dashboardFacts([scheduleTask],plan,'2026-11-13');
 expect(r.deadline).toBe('2026-11-12');expect(r.percent).toBe(0);expect(r.missing).toEqual(['範囲別実績']);
 expect(dashboardFacts([scheduleTask],null,'2026-11-13').deadline).toBeNull();
 expect(dashboardFacts([{...scheduleTask,status:'completed'}],plan,'2026-11-13')).toMatchObject({deadline:null,comparisonTotal:0,missing:[]});
});
