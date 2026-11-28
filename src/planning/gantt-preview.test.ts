import {describe,expect,it} from 'vitest';
import {scheduleFixture,scheduleTask} from '../../tests/schedule-fixture';
import {DEFAULT_CALENDAR} from './events';
import {buildGanttPreview,GANTT_PREVIEW_DAYS} from './gantt-preview';
import {addDays,emptyPlan,type PlanningTask} from './model';
import {adoptedDay} from './schedule-layers';
import {taskLearningAlert} from './learning-alerts';

const today='2026-11-28';
const next=addDays(today,1),later=addDays(today,2);
const emptyCapacity=Object.fromEntries(Array.from({length:GANTT_PREVIEW_DAYS},(_,i)=>[addDays(today,i),0]));
const task=(id:string,unit='第14回'):PlanningTask=>({...scheduleTask,id,unit,title:id});
const estimate=(tasks:PlanningTask[],plan:ReturnType<typeof scheduleFixture>|null,capacity:Record<string,number>,minutes=15)=>
 buildGanttPreview(tasks,plan,DEFAULT_CALENDAR,today,{...emptyCapacity,...capacity},minutes);

describe('display-only Gantt previews',()=>{
 it('prioritizes overdue tasks and nearest deadlines while honoring confirmed zero and existing bookings',()=>{
  const official=scheduleTask;
  const plan=scheduleFixture();
  plan.scope[0].deadline=null;
  plan.capacities={[today]:60};
  plan.items[0].ranges[0].day=next;
  plan.items[0].ranges[0].minutes=10;
  plan.items[0].endDay=next;
  plan.items[0].dailyWork={[next]:{units:1,minutes:10}};
  const closed={...task('closed','第13回'),status:'completed' as const};
  const overdue={...task('overdue','第13回'),planning:{...emptyPlan(),deadline:addDays(today,-1)}};
  const urgent={...task('urgent'),planning:{...emptyPlan(),deadline:next}};
  const open=task('open');
  const tasks=[closed,open,urgent,official,overdue];
  const before=structuredClone({tasks,plan});
  const result=estimate(tasks,plan,{[next]:25,[later]:15});
  expect(result.days.get(today)).toMatchObject({limit:0,confirmed:true,draft:0});
  expect(result.days.get(next)).toMatchObject({booked:10,draft:15,limit:25});
  expect([...result.inHorizonAdopted]).toEqual([official.id]);
  expect(result.placements.get(overdue.id)).toEqual({day:next,minutes:15,timeUnknown:true,scopeUnknown:true,overdue:true});
  expect(result.placements.get(open.id)?.day).toEqual(later);
  expect(result.unplaced.map(row=>[row.task.id,row.reason])).toEqual([[urgent.id,'deadline']]);
  expect(taskLearningAlert(overdue,plan,DEFAULT_CALENDAR,today).overdueDays).toBe(1);
  expect({tasks,plan}).toEqual(before);
 });

 it('renders the stored end of a one-sided manual schedule and avoids unmeasured bookings',()=>{
  const manual={...task('manual'),planning:{...emptyPlan(),endDay:today}};
  expect(adoptedDay(manual,null,today)).toBe(true);
  expect(adoptedDay(manual,null,next)).toBe(false);
  const result=estimate([manual,task('open')],null,{[today]:60});
  expect(result.days.get(today)?.unknownBooking).toBe(true);
  expect(result.placements.size).toBe(0);
  expect(result.unplaced[0]?.reason).toBe('unknown-booking');
 });

 it('uses registered undated work before the display default and removes it when an official date arrives',()=>{
  const native={...task('registered'),planning:{...emptyPlan(),ranges:[
   {id:'range',label:'問1〜3',units:3,minutes:20,day:'',done:false,graded:false,corrected:false,actualDay:null,actualSeconds:null},
  ]}};
  const open=task('unmeasured');
  const initial=estimate([native,open],null,{[next]:20,[later]:10},10);
  expect(initial.placements.get(native.id)).toMatchObject({day:next,minutes:20,timeUnknown:false,scopeUnknown:false});
  expect(initial.placements.get(open.id)).toMatchObject({day:later,minutes:10,timeUnknown:true});
  const adopted={...native,planning:{...native.planning,ranges:native.planning.ranges.map(range=>({...range,day:next}))}};
  const result=estimate([adopted,open],null,{[next]:20,[later]:10},10);
  expect(result.placements.has(native.id)).toBe(false);
  expect(result.inHorizonAdopted.has(native.id)).toBe(true);
  expect(result.days.get(next)).toMatchObject({booked:20,draft:0});
 });
});
