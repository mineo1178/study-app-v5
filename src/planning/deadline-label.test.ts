import {it,expect} from 'vitest';
import {deadlineLabel} from './deadline-label';
import {taskLearningAlert} from './learning-alerts';
import {DEFAULT_CALENDAR} from './events';
import {emptyPlan} from './model';
import {scheduleTask} from '../../tests/schedule-fixture';
const today='2026-11-14';
it.each([['2026-11-13','期限超過 1日'],['2026-11-10','期限超過 4日'],['2026-11-14','期限当日'],['2026-11-17','期限接近 あと3日'],['2026-11-18',null]])('uses the existing deadline computation: %s',(day,label)=>{
 const t={...scheduleTask,planning:{...emptyPlan(),deadline:day}},a=taskLearningAlert(t,null,DEFAULT_CALENDAR,today),before=structuredClone(t);
 expect(deadlineLabel(a)?.text??null).toBe(label);expect(t).toEqual(before);
 if(label)expect(deadlineLabel(a)?.description).toContain('期限日：'+day);
});
it('does not warn for unknown, provisional or completed tasks',()=>{
 const t={...scheduleTask,unit:'第13回'};expect(deadlineLabel(taskLearningAlert(t,null,DEFAULT_CALENDAR,today))).toBeNull();
 const a=taskLearningAlert({...scheduleTask,status:'completed'},null,DEFAULT_CALENDAR,today);expect(deadlineLabel(a)).toBeNull();
 expect(deadlineLabel({...a,task:scheduleTask,overdueDays:3,deadline:{...a.deadline,confirmed:false}})).toBeNull();
});
it('keeps formal deadline priority over a different manual schedule',()=>{
 const t={...scheduleTask,planning:{...emptyPlan(),wbs:{taskId:scheduleTask.id,startDay:'',endDay:'2026-11-30',progress:null,updatedBy:'fixture',updatedAt:1}}};
 const label=deadlineLabel(taskLearningAlert(t,null,DEFAULT_CALENDAR,today));
 expect(label?.text).toBe('期限超過 2日');expect(label?.description).toContain('2026-11-12');expect(label?.description).toContain('正式完了期限');
});
