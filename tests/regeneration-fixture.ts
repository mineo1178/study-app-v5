import {officialFixture} from './official-fixture';
import {scheduleFixture,scheduleTask} from './schedule-fixture';
import {initialResolutions} from '../src/planning/official-schedule';
import {addDays,type PlanningTask} from '../src/planning/model';
export function regenerationFixture(){
 const tasks:PlanningTask[]=[{...structuredClone(scheduleTask),id:'normal'},{...structuredClone(scheduleTask),id:'next',unit:'第12回'},{...structuredClone(scheduleTask),id:'done',status:'completed'}],current=scheduleFixture(),estimates=officialFixture();
 current.revision=3;current.generatedAt='2026-11-14T00:00:00Z';current.accountBinding='a'.repeat(64);current.scope[0].deadline=null;current.capacities=Object.fromEntries(Array.from({length:7},(_,i)=>[addDays('2026-11-14',i),30]));current.items[0]={...current.items[0],endDay:'2026-11-20',deadline:null,ranges:[],dailyWork:{},stages:[{phase:'first_and_marking',day:'2026-11-18',minutes:20,conditional:false},{phase:'correction',day:'2026-11-19',minutes:10,conditional:true},{phase:'final_check',day:'2026-11-20',minutes:2,conditional:false}]};current.items[0].baseline={id:'fixed-preserved',targetDay:'2026-11-19',daily:{'2026-11-19':100},evidence:{provisional:true,historyCount:0,estimatedMinutes:null,method:'未測定',conditions:[],manualAdjustmentMinutes:null}};
 estimates.planId=current.planId;estimates.revision=5;estimates.planningPolicy.initialCompletionDefinition='演習・採点・必要な直し・最終確認';
 estimates.planningPolicy.taskSchedules=tasks.filter(t=>t.status!=='completed').map(t=>({...current.items[0],taskId:t.id,unit:t.unit,materialId:'legacy-'+t.id,statusAtGeneration:t.status,availability:{notBefore:'2026-11-14'},phases:structuredClone(current.items[0].stages)}));
 current.proposalImport={source:structuredClone(estimates),records:initialResolutions(estimates,tasks,null)};current.proposalImport.source.revision=3;return{tasks,current,estimates};
}
