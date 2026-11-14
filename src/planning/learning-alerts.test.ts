import {ganttLag} from './gantt-lag';
import {it,expect} from 'vitest';
import {learningAlerts,taskLearningAlert,taskDeadline} from './learning-alerts';
import {DEFAULT_CALENDAR,type EventCalendar} from './events';
import {emptyPlan} from './model';
import {getJstDay} from '../review/model';
import {scheduleFixture,scheduleTask} from '../../tests/schedule-fixture';
const calendar=():EventCalendar=>structuredClone(DEFAULT_CALENDAR);
const task=(unit='第11回')=>({...scheduleTask,unit,status:'in_progress' as const});
it('uses JST today: before/on deadline are within, next day overdue; completed never warns',()=>{
 const t=task(),c=calendar();expect(taskLearningAlert(t,null,c,'2026-11-11').overdueDays).toBe(0);expect(taskLearningAlert(t,null,c,'2026-11-12').overdueDays).toBe(0);expect(taskLearningAlert(t,null,c,'2026-11-13').overdueDays).toBe(1);
 expect(taskLearningAlert(t,null,c,getJstDay(Date.parse('2026-11-12T14:59:59Z'))).overdueDays).toBe(0);expect(taskLearningAlert(t,null,c,getJstDay(Date.parse('2026-11-12T15:00:00Z'))).overdueDays).toBe(1);
 expect(taskLearningAlert({...t,status:'completed'},null,c,'2026-11-14')).toMatchObject({overdueDays:0,near:false,delayed:false});
 expect(taskLearningAlert(task('第12回'),null,c,'2026-11-19').overdueDays).toBe(0);expect(taskLearningAlert(task('第12回'),null,c,'2026-11-20').overdueDays).toBe(1);
});
it('distinguishes unknown/provisional deadlines, unmeasured progress and confirmed overdue',()=>{
 const c=calendar(),t=task('第13回');expect(learningAlerts([t],null,c,'2026-11-14')).toMatchObject({kind:'unknown',text:'期限未設定'});
 expect(learningAlerts([task('第12回')],null,c,'2026-11-14')).toMatchObject({kind:'within',text:'期限内',detail:'進捗比較は未測定'});
 const actual=taskLearningAlert(task(),null,c,'2026-11-14');expect(actual.red).toBeNull();expect(actual.overdueDays).toBe(2);expect(actual.delayed).toBe(false);
 c.events.push({...c.events[0],eventId:'test13',rounds:['第13回'],day:'2026-11-15'});const plan=scheduleFixture();plan.items=[];plan.scope=[{unit:'第13回',subjects:['math'],deadline:null}];plan.capacities={'2026-11-14':60};expect(taskLearningAlert(t,plan,c,'2026-11-20')).toMatchObject({overdueDays:0,deadline:{day:'2026-11-14',confirmed:false}});
});
it('resolves task explicit > round formal > adopted end > official next lesson; ignores fixed goals',()=>{
 const c=calendar(),p=scheduleFixture(),t={...task(),planning:{...emptyPlan(),wbs:{taskId:'normal',startDay:'',endDay:'2026-11-30',progress:100,updatedBy:'p',updatedAt:1}}};
 p.items[0].deadline=null;p.scope[0].deadline=null;expect(taskDeadline(t,p,c).day).toBe('2026-11-12');
 t.planning.deadline='2026-11-10';expect(taskDeadline(t,p,c)).toMatchObject({day:'2026-11-10',scope:'task'});
 const third={...t,unit:'第13回',planning:{...emptyPlan(),baseline:{id:'b',createdDay:'2026-11-01',targetDay:'2026-11-01',daily:{},evidence:{source:'fixed',count:0,firstSeconds:null,redoSeconds:null,redoDays:0,conditions:'',manualMinutes:null,provisional:false}}}};
 const before=JSON.stringify(third);expect(taskDeadline(third,null,c).day).toBeNull();c.events.push({...c.events[0],eventId:'class14',kind:'lesson',rounds:['第14回'],nextLessonFor:['第13回'],day:'2026-11-27'});expect(taskDeadline(third,null,c).day).toBe('2026-11-26');
 const adopted={...p,items:[{...p.items[0],unit:'第13回',deadline:null,endDay:'2026-11-25'}]};expect(taskDeadline(third,adopted,c).day).toBe('2026-11-25');expect(JSON.stringify(third)).toBe(before);
});
it('deduplicates task IDs, counts unfinished only and prioritizes overdue then near',()=>{
 const a=task(),b={...task('第12回'),id:'b'},done={...a,id:'done',status:'completed' as const},c=calendar();
 const r=learningAlerts([a,a,b,done],null,c,'2026-11-16');expect(r.overdue).toHaveLength(1);expect(r.near).toHaveLength(1);expect(r.kind).toBe('overdue');expect(r.text).toBe('期限超過 1件');
 expect(learningAlerts([b],null,c,'2026-11-16')).toMatchObject({kind:'near',text:'第12回：あと3日'});expect(learningAlerts([b],null,c,'2026-11-19').text).toContain('今日が期限');
});
it('uses only comparable red progress, never manual percentage or purple-only lag',()=>{
 const scope={scopeId:'q',label:'問題1〜10',total:10,confirmed:true,weights:{first:1,grading:1,mastery:1,confirmed:true}},q={...scope,daily:{'2026-11-13':{first:10,grading:8,mastery:0},'2026-11-30':{first:0,grading:2,mastery:10}}};
 const t={...task('第13回'),planning:{...emptyPlan(),deadline:'2026-12-01',questionPlan:q,questionMeasurement:{...scope,firstDone:6,graded:4,redoNeeded:2,redoDone:0,correctionStatus:'required' as const,noErrorsConfirmed:false,observedAt:1}}};
 expect(learningAlerts([t],null,calendar(),'2026-11-14')).toMatchObject({kind:'delayed',difference:-20,text:'予定より20pt遅れ'});
 const onTime={...t,planning:{...t.planning,questionMeasurement:{...t.planning.questionMeasurement,firstDone:10,graded:5}}};expect(learningAlerts([onTime],null,calendar(),'2026-11-14')).toMatchObject({kind:'within',difference:0});
 const purpleOnly={...onTime,planning:{...onTime.planning,questionGoal:{id:'goal',revision:1,adoptedAt:1,reason:'確認',plan:{...q,daily:{'2026-11-13':{first:10,grading:10,mastery:10}}}}}};expect(ganttLag([purpleOnly],null,'2026-11-14').goal).toBe(-40);expect(taskLearningAlert(purpleOnly,null,calendar(),'2026-11-14')).toMatchObject({red:0,delayed:false});
 const wrong={...t,planning:{...t.planning,questionPlan:{...q,scopeId:'other'},wbs:{taskId:t.id,startDay:'',endDay:'',progress:0,updatedBy:'p',updatedAt:1}}};expect(learningAlerts([wrong],null,calendar(),'2026-11-14')).toMatchObject({kind:'within',difference:null});
});
