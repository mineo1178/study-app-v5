import {it,expect} from 'vitest';
import {scheduleTask,scheduleFixture} from '../../tests/schedule-fixture';
import {emptyPlan} from './model';
import {wbsEditValues} from './wbs-edit';
import {referencePlan} from './schedule-reference';
import {officialFixture} from '../../tests/official-fixture';
it('prefills proposal dates only in a date editor without adopting or changing the source',()=>{const source=officialFixture();source.planningPolicy.taskSchedules=[{...scheduleTask,taskId:scheduleTask.id,materialId:'legacy-normal',recommendedEndDate:'2026-11-20',phases:[{phase:'first_and_marking',day:'2026-11-16',minutes:25,conditional:false}]}];const p=referencePlan(source,[scheduleTask],null,''),copy=structuredClone(p);expect(wbsEditValues(scheduleTask,p,'startDay')).toEqual({startDay:'2026-11-16',endDay:'2026-11-20',progress:''});expect(wbsEditValues(scheduleTask,p,'progress')).toEqual({startDay:'',endDay:'',progress:''});expect(p).toEqual(copy);expect(p.items).toHaveLength(0);});
it('keeps manual values before proposal dates; zero is a saved manual value',()=>{const t={...scheduleTask,planning:{...emptyPlan(),wbs:{taskId:'normal',startDay:'2026-11-10',endDay:'2026-11-11',progress:0,updatedBy:'parent',updatedAt:123}}};expect(wbsEditValues(t,scheduleFixture(),'endDay')).toEqual({startDay:'2026-11-10',endDay:'2026-11-11',progress:'0'});});
it('prefills an adopted date for editing but never promotes it while editing progress',()=>{expect(wbsEditValues(scheduleTask,scheduleFixture(),'startDay')).toMatchObject({startDay:'2026-11-12',endDay:'2026-11-12'});expect(wbsEditValues(scheduleTask,scheduleFixture(),'progress')).toMatchObject({startDay:'',endDay:''});});
