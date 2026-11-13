import {it,expect} from 'vitest';
import {standardTargetDay,targetPreview,reviseTarget} from './target-edit';
import {emptyPlan,validatePlanTransition} from './model';
import {displayItem,targetDisplay} from './gantt-display';
import {parseSchedule} from './schedule';
import {scheduleFixture,scheduleTask} from '../../tests/schedule-fixture';
import {officialFixture} from '../../tests/official-fixture';
import {initialResolutions,oldItem,exportScheduleFeedback} from './official-schedule';
const today='2026-11-13';
it('uses Thursday before switching rounds and honors later lessons',()=>{
 const p=scheduleFixture(),source=officialFixture();p.proposalImport={source,records:initialResolutions(source,[scheduleTask],null)};
 expect(standardTargetDay(scheduleTask,p,today)).toBe('2026-11-12');
 expect(standardTargetDay({...scheduleTask,unit:'第12回'},p,today)).toBe('2026-11-19');
 source.classEvents.push({date:'2026-11-20',round:11,subjects:['math'],status:'document',evidenceRefs:['e1']});expect(standardTargetDay(scheduleTask,p,today)).toBe('2026-11-26');
});
it('shows capacity shortfall without shortening estimated phases',()=>{
 const p=scheduleFixture();p.capacities={'2026-11-13':5,'2026-11-14':0};p.items[0].stages=[{phase:'first_and_marking',day:today,minutes:20,conditional:false},{phase:'correction',day:'2026-11-14',minutes:10,conditional:true},{phase:'final_check',day:'2026-11-14',minutes:2,conditional:false}];
 const result=targetPreview(scheduleTask,[scheduleTask],p,today,'2026-11-14');expect(result.estimated).toBe(32);expect(result.shortfall).toBe(27);expect(result.provisional).toBe(true);
});
it('keeps imported and prior target snapshots, creates task revisions and exports them',()=>{
 const p=scheduleFixture(),task={...scheduleTask,planning:emptyPlan()},before=structuredClone(task);
 const first=reviseTarget(task,[task],p,today,'2026-11-19','標準の木曜期限','scope unknown',1000);
 validatePlanTransition(task.planning,first);expect(task).toEqual(before);expect(first.targetRevisions![0].previousBaseline).toEqual(p.items[0].baseline);
 const saved={...task,planning:{...first,revision:1}},second=reviseTarget(saved,[saved],p,today,'2026-11-20','学習時間を調整','',2000);
 validatePlanTransition(saved.planning,second);expect(second.baselineHistory).toEqual([first.baseline]);expect(second.targetRevisions).toHaveLength(2);
 expect(targetDisplay(saved,p,[saved],today).day).toBe('2026-11-19');expect(displayItem(saved,p).baseline.id).toBe(first.baseline!.id);
 expect(exportScheduleFeedback([saved],p,'binding').tasks[0].targetRevisions).toHaveLength(1);
});
it('keeps date-only targets unmeasured and compatible with exported schedule items',()=>{
 const task={...scheduleTask,planning:emptyPlan()},next=reviseTarget(task,[task],null,today,'2026-11-12','標準の木曜期限','',1000),saved={...task,planning:next};
 expect(next.baseline).toMatchObject({targetDay:'2026-11-12',daily:{},basisStatus:'unmeasured'});
 const p=scheduleFixture();p.items=[oldItem(saved)];expect(()=>parseSchedule(JSON.stringify(p))).not.toThrow();expect(displayItem(saved,p).baseline.daily).toEqual({});
});
