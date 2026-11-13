import {it,expect} from 'vitest';
import {prepareScheduleFile} from './import-file';
import {scheduleFixture,scheduleTask} from '../../tests/schedule-fixture';
import {officialFixture} from '../../tests/official-fixture';
import {initialResolutions} from './official-schedule';
import type {PlanningTask} from './model';
const binding='a'.repeat(64);
function priorityFixture(){
 const plan=scheduleFixture(),source=officialFixture();
 const tasks:PlanningTask[]=Array.from({length:10},(_,i)=>({...scheduleTask,id:'b-'+i,title:'課題'+i,status:i===9?'completed':'not_started'}));
 source.planId=plan.planId='priority-fixture';plan.accountBinding=binding;plan.baseVersion=null;
 plan.items=tasks.map(task=>({...structuredClone(plan.items[0]),taskId:task.id,title:task.title,materialId:'legacy-'+task.id,ranges:[],dailyWork:{},baseline:{id:'unset',targetDay:null,daily:{},evidence:{provisional:true,historyCount:0,estimatedMinutes:null,method:'未測定',conditions:[],manualAdjustmentMinutes:null}},stages:task.status==='completed'?[]:[{phase:'first_and_marking',day:'2026-11-12',minutes:10,conditional:false}]}));
 source.planningPolicy.adoptionDecision={status:'guardian_selected_priority_plan',selectedTaskIds:tasks.map(t=>t.id),completedTaskIds:['b-9'],pendingTaskIds:tasks.slice(0,9).map(t=>t.id)};
 source.planningPolicy.taskSchedules=plan.items.slice(0,9).map(item=>({...item,phases:structuredClone(item.stages),statusAtGeneration:'not_started',recommendedEndDate:item.endDay}));
 plan.proposalImport={source,records:initialResolutions(source,tasks,null)};
 return{plan,tasks};
}
it('accepts the approved ten-task B plan with nine matching stages and a completed task',()=>{
 const {plan,tasks}=priorityFixture();expect(prepareScheduleFile(JSON.stringify(plan),tasks,null,binding)).toMatchObject({referenceOnly:false,duplicate:false,scheduledCount:9});
 expect(prepareScheduleFile(JSON.stringify(plan),tasks,plan,binding).duplicate).toBe(true);
});
it('rejects account, task, status, approval, manual-date, revision and baseline conflicts',()=>{
 const {plan,tasks}=priorityFixture();
 expect(()=>prepareScheduleFile(JSON.stringify(plan),tasks,null,'b'.repeat(64))).toThrow();
 expect(()=>prepareScheduleFile(JSON.stringify(plan),tasks.slice(1),null,binding)).toThrow();
 expect(()=>prepareScheduleFile(JSON.stringify(plan),tasks.map((t,i)=>i===0?{...t,status:'completed'}:t),null,binding)).toThrow();
 expect(()=>prepareScheduleFile(JSON.stringify(plan),tasks.map((t,i)=>i===0?{...t,history:[{duration:60,endAt:Date.parse(plan.generatedAt)+1000}]}:t),null,binding)).toThrow('実績更新');
 const altered=structuredClone(plan);altered.items[0].stages![0].minutes=11;expect(()=>prepareScheduleFile(JSON.stringify(altered),tasks,null,binding)).toThrow();
 const manual=tasks.map((t,i)=>i===0?{...t,planning:{schemaVersion:1 as const,revision:0,endDay:'2026-11-15',deadline:'',ranges:[],baseline:null,baselineHistory:[]}}:t);expect(()=>prepareScheduleFile(JSON.stringify(plan),manual,null,binding)).toThrow();
 const current=structuredClone(plan);current.revision=2;expect(()=>prepareScheduleFile(JSON.stringify(plan),tasks,current,binding)).toThrow();
 const changed=structuredClone(plan);changed.notes.push('changed');expect(()=>prepareScheduleFile(JSON.stringify(changed),tasks,plan,binding)).toThrow();
});
it('imports official proposal files only as reference with no new adoption',()=>{
 const p=prepareScheduleFile(JSON.stringify(officialFixture()),[scheduleTask],null,binding);expect(p.referenceOnly).toBe(true);expect(p.plan.items).toHaveLength(0);expect(p.plan.proposalImport!.records.every(r=>!r.selected)).toBe(true);
});
