import {it,expect} from 'vitest';
import {scheduleFixture,scheduleTask} from '../../tests/schedule-fixture';
import {emptyPlan} from './model';
import {lightningPoints} from './lightning';
import type {QuestionMeasurement,QuestionPlan} from './question-progress';
it('draws formal lines only for measured progress and adopted daily bases',()=>{
 const plan=scheduleFixture();expect(lightningPoints(scheduleTask,plan,'2026-11-12','2026-11-10',7)).toEqual([]);
 const range=plan.items[0].ranges[0],task={...scheduleTask,planning:{...emptyPlan(),wbs:{taskId: 'normal',startDay:'',endDay:'',progress:40,updatedBy:'p',updatedAt:1}}};expect(lightningPoints(task,plan,'2026-11-12','2026-11-10',7)).toEqual([]);
 task.planning.ranges=[{...range,day:range.day!,done:false,graded:false,corrected:false,actualDay:null,actualSeconds:null}];task.planning.ranges[0].done=true;
 const lines=lightningPoints(task,plan,'2026-11-12','2026-11-10',7);expect(lines).toHaveLength(2);expect(lines[0].difference).toBe(-100);expect(Number(lines[0].points.split(' ')[1].split(',')[0])).toBeLessThan(185);
});
it('plots counted red -20 and purple -10 left, positive right, zero centered; mismatched scopes stay absent',()=>{
 const scope={scopeId:'q',label:'問題1〜10',total:10,confirmed:true,weights:{first:1,grading:1,mastery:1,confirmed:true}};
 const measurement:QuestionMeasurement={...scope,firstDone:6,graded:4,redoNeeded:2,redoDone:0,correctionStatus:'required',noErrorsConfirmed:false,observedAt:1};
 const plan:QuestionPlan={...scope,daily:{'2026-11-13':{first:10,grading:8,mastery:0},'2026-11-19':{first:0,grading:2,mastery:10}}};
 const goal={...plan,daily:{'2026-11-13':{first:10,grading:5,mastery:0},'2026-11-19':{first:0,grading:5,mastery:10}}};
 const task={...scheduleTask,planning:{...emptyPlan(),questionMeasurement:measurement,questionPlan:plan,questionGoal:{id:'goal',revision:1,adoptedAt:1,reason:'確認',plan:goal}}};
 const x=(points:string)=>Number(points.split(' ')[1].split(',')[0]),center=14.5*74;
 const lines=lightningPoints(task,null,'2026-11-13','2026-10-30',29);
 expect(lines.map(l=>l.difference)).toEqual([-20,-10]);expect(lines.every(l=>x(l.points)<center)).toBe(true);
 const ahead={...task,planning:{...task.planning,questionMeasurement:{...measurement,firstDone:10,graded:10,redoNeeded:6}}};
 expect(lightningPoints(ahead,null,'2026-11-13','2026-10-30',29).every(l=>x(l.points)>center)).toBe(true);
 const zero={...task,planning:{...task.planning,questionMeasurement:{...measurement,firstDone:10,graded:5,redoNeeded:2}}};
 expect(x(lightningPoints(zero,null,'2026-11-13','2026-10-30',29)[0].points)).toBe(center);
 expect(lightningPoints({...task,planning:{...task.planning,questionPlan:{...plan,scopeId:'other'},questionGoal:undefined}},null,'2026-11-13','2026-10-30',29)).toEqual([]);
 expect(lightningPoints(task,null,'2026-11-13','2026-11-20',7)).toEqual([]);
});
