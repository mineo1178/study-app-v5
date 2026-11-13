import {it,expect} from 'vitest';
import {scheduleFixture,scheduleTask} from '../../tests/schedule-fixture';
import {emptyPlan} from './model';
import {lightningPoints} from './lightning';
it('draws formal lines only for measured progress and adopted daily bases',()=>{
 const plan=scheduleFixture();expect(lightningPoints(scheduleTask,plan,'2026-11-12','2026-11-10',7)).toEqual([]);
 const range=plan.items[0].ranges[0],task={...scheduleTask,planning:{...emptyPlan(),wbs:{taskId: 'normal',startDay:'',endDay:'',progress:40,updatedBy:'p',updatedAt:1}}};expect(lightningPoints(task,plan,'2026-11-12','2026-11-10',7)).toEqual([]);
 task.planning.ranges=[{...range,day:range.day!,done:false,graded:false,corrected:false,actualDay:null,actualSeconds:null}];task.planning.ranges[0].done=true;
 const lines=lightningPoints(task,plan,'2026-11-12','2026-11-10',7);expect(lines).toHaveLength(2);expect(lines[0].difference).toBe(-100);expect(Number(lines[0].points.split(' ')[1].split(',')[0])).toBeLessThan(185);
});
