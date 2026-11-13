import {it,expect} from 'vitest';
import {DEFAULT_CALENDAR,automaticDeadline,automaticOverdue,emptyEventStore,parseEventCalendar,parseEventStore,prepareEventImport,visibleEvents,type EventCalendar} from './events';
import {scheduleTask,scheduleFixture} from '../../tests/schedule-fixture';
import {ganttRows,taskCounts} from './gantt-grid';

const at='2026-11-14T12:00:00+09:00';
const calendar=():EventCalendar=>({...structuredClone(DEFAULT_CALENDAR),calendarId:'test-events',generatedAt:at});
const lesson=()=>({...DEFAULT_CALENDAR.events[0],eventId:'lesson-14',kind:'lesson' as const,name:'算国14回①',label:'授業',day:'2026-11-27',rounds:['第14回'],nextLessonFor:['第13回'],updatedAt:at});
it('keeps the exact confirmed event and distinct round11/12 completion deadlines',()=>{
 const c=parseEventCalendar(JSON.stringify(DEFAULT_CALENDAR));expect(c.events[0]).toMatchObject({day:'2026-11-21',label:'カリテ11・12回'});
 expect(automaticDeadline('第11回',c)).toMatchObject({day:'2026-11-12',confirmed:true});expect(automaticDeadline('第12回',c)).toMatchObject({day:'2026-11-19',confirmed:true});
 const moved={...c,events:c.events.map(e=>({...e,day:'2026-11-28'}))};expect(automaticDeadline('第11回',moved).day).toBe('2026-11-12');expect(automaticDeadline('第12回',moved).day).toBe('2026-11-19');
});
it('uses explicit deadlines before next lessons; observes changed classes and cancellations',()=>{
 const c=calendar();c.events.push(lesson());expect(automaticDeadline('第13回',c)).toMatchObject({day:'2026-11-26',confirmed:true});
 c.events[1].day='2026-11-26';expect(automaticDeadline('第13回',c).day).toBe('2026-11-25');
 c.deadlines.push({...c.deadlines[0],unit:'第13回',day:'2026-11-24'});expect(automaticDeadline('第13回',c).day).toBe('2026-11-24');
 c.deadlines.pop();c.events[1].cancelled=true;expect(automaticDeadline('第13回',c).day).toBeNull();
});
it('does not infer weekly tests or deadlines without evidence; test-only capacity is provisional',()=>{
 const c=calendar();expect(visibleEvents(c).map(e=>e.day)).toEqual(['2026-11-21']);expect(automaticDeadline('第13回',c)).toMatchObject({day:null,confirmed:false});
 c.events=[{...c.events[0],rounds:['第13回'],day:'2026-12-05'}];expect(automaticDeadline('第13回',c,{'2026-12-04':60,'2026-12-05':90})).toMatchObject({day:'2026-12-04',confirmed:false});
 expect(automaticOverdue([{...scheduleTask,unit:'第13回'}],c,[],'2026-12-06')).toEqual([]);
});
it('rejects unconfirmed/invalid events, duplicate IDs and same-day natural duplicates',()=>{
 const c=calendar();for(const patch of [{confirmed:false},{day:'2026-02-30'},{source:''},{rounds:['13']},{nextLessonFor:['第12回']}])expect(()=>parseEventCalendar(JSON.stringify({...c,events:[{...c.events[0],...patch}]}))).toThrow();
 expect(()=>parseEventCalendar(JSON.stringify({...c,events:[c.events[0],c.events[0]]}))).toThrow();
 expect(()=>parseEventCalendar(JSON.stringify({...c,events:[c.events[0],{...c.events[0],eventId:'another'}]}))).toThrow();
});
it('allows multiple different event kinds on a day and imported new IDs cannot duplicate an existing test',()=>{
 const c=calendar();c.events[0].eventId='different-id';c.events[0].updatedAt=at;c.events.push({...lesson(),day:'2026-11-21'});
 const next=prepareEventImport(JSON.stringify(c),emptyEventStore(),{},at);expect(visibleEvents(next.store.calendar).filter(e=>e.day==='2026-11-21')).toHaveLength(2);
 expect(prepareEventImport(JSON.stringify(c),next.store,{},at)).toMatchObject({duplicate:true,added:0,changed:0});
 expect(next.store.calendar.events.find(e=>e.kind==='karite')?.eventId).toBe(DEFAULT_CALENDAR.events[0].eventId);
});
it('requires monotonic revisions and never mutates the input store or task data',()=>{
 const c=calendar(),store=emptyEventStore(),before=JSON.stringify(store);const result=prepareEventImport(JSON.stringify(c),store,{},at);
 expect(JSON.stringify(store)).toBe(before);expect(()=>prepareEventImport(JSON.stringify({...c,revision:1,events:[]}),result.store,{},at)).toThrow();expect(()=>prepareEventImport(JSON.stringify({...c,revision:0}),result.store,{},at)).toThrow();
});
it('protects the confirmed old round deadlines and rejects corrupt cached history',()=>{
 const c=calendar();c.deadlines[0].day='2026-11-19';expect(()=>prepareEventImport(JSON.stringify(c),emptyEventStore(),{},at)).toThrow('確定完了期限');
 expect(parseEventStore(JSON.stringify(emptyEventStore()))).toEqual(emptyEventStore());expect(()=>parseEventStore(JSON.stringify({...emptyEventStore(),history:[{}]}))).toThrow();
});
it('keeps deadline changes and past overdue even when a future lesson moves later',()=>{
 const c=calendar();c.events=[lesson()];const first=prepareEventImport(JSON.stringify(c),emptyEventStore(),{},at);
 const next={...c,revision:2,events:[{...lesson(),day:'2026-12-04',updatedAt:'2026-11-28T12:00:00+09:00'}]};
 const result=prepareEventImport(JSON.stringify(next),first.store,{},'2026-11-28T13:00:00+09:00');expect(result.changes).toContainEqual(expect.objectContaining({unit:'第13回',before:expect.objectContaining({day:'2026-11-26'}),after:expect.objectContaining({day:'2026-12-03'})}));
 const task={...scheduleTask,unit:'第13回',planning:{schemaVersion:1 as const,revision:4,endDay:'2026-12-10',deadline:'',ranges:[],baseline:null,baselineHistory:[]}};const before=JSON.stringify(task);
 expect(automaticOverdue([task],result.store.calendar,result.store.history,'2026-11-28')).toHaveLength(1);expect(automaticOverdue([{...task,status:'completed'}],result.store.calendar,result.store.history,'2026-11-28')).toHaveLength(0);expect(JSON.stringify(task)).toBe(before);
});
it('uses real tasks only for WBS rounds; add/remove13 cannot leave a scope-only row or change counts',()=>{
 const plan=scheduleFixture();plan.scope.push({unit:'第13回',subjects:['math'],deadline:null});const task={...scheduleTask,id:'round13',unit:'第13回'};
 expect(ganttRows([scheduleTask],plan).some(r=>r.label==='第13回')).toBe(false);expect(ganttRows([scheduleTask,task],plan).filter(r=>r.kind==='unit').map(r=>r.label)).toEqual(['第13回','第11回']);
 expect(ganttRows([scheduleTask],plan).some(r=>r.label==='第13回')).toBe(false);expect(taskCounts([scheduleTask])).toMatchObject({total:1,completed:0});
});
