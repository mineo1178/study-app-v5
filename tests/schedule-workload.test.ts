import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {WorkloadReview} from '../src/components/WorkloadReview';
import {emptyPlan} from '../src/planning/model';
import {taskIdentity} from '../src/planning/official-schedule';
import {mergeTutorSchedule} from '../src/planning/schedule-sync';
import {confirmedWorkload,workloadEvidence} from '../src/planning/workload';
import {detectReplan,replanSnapshot,tutorInput,validateTutorPlan} from '../scripts/schedule-sync/replan';
import {officialFixture} from './official-fixture';
import {scheduleFixture,scheduleTask} from './schedule-fixture';

const today='2026-11-12',now=Date.parse(today+'T04:00:00Z'),binding='a'.repeat(64);
const task={...scheduleTask,unit:'第14回',title:'練習問題（問１〜５）'};
const peers={...task,id:'prior',unit:'第13回',history:[
 {attemptType:'first',duration:600,score:0,units:5},
 {attemptType:'redo',duration:240,graded:true,units:5},
 {attemptType:'first',duration:3000,graded:true,units:4},
 {attemptType:'first',duration:3000,graded:true,units:5,reviewStatus:'pending'},
 {attemptType:'redo',duration:3000,graded:true,units:5,operationCheck:true},
]};

it('keeps section labels and pages without a count unmeasured and estimates only equivalent graded work',()=>{
 expect(workloadEvidence({...task,title:'①'},[],[peers],null)).toEqual({scope:null,time:null});
 expect(workloadEvidence({...task,title:'練習問題（p.12～14）'},[],[peers],null)).toMatchObject({scope:{units:null},time:null});
 expect(workloadEvidence(task,[],[peers],null)).toMatchObject({scope:{units:5,source:'登録済み課題名の明示範囲'},
  time:{kind:'estimated',minutes:14,firstSeconds:600,gradingSeconds:null,redoSeconds:240}});
 expect(workloadEvidence(task,[],[{...peers,title:'基本問題'}],null).time).toBeNull();
 expect(workloadEvidence(task,[],[{...peers,materialName:'別教材'}],null).time).toBeNull();
 expect(workloadEvidence(task,[],[{...peers,history:[peers.history[0]]}],null).time).toMatchObject({minutes:null,firstSeconds:600,redoSeconds:null});
});

it('only uses a documentary assignment with a current verified task match',()=>{
 const current=scheduleFixture(),source=officialFixture(),lesson={...scheduleTask,title:'確認テスト'};
 source.taskProposals[0].scope={pdfPages:[1],selection:'confirmed_scope',instructions:'問1〜5'};
 current.proposalImport={source,records:[{proposalTaskId:'proposal-1',taskId:lesson.id,identity:taskIdentity(lesson),
  verified:false,reason:'確認済み資料の照合',selected:false,adoptRecommendation:false,adoptedDay:null,adoptHistoryTarget:false}]};
 expect(workloadEvidence(lesson,[],[],current).scope).toBeNull();
 current.proposalImport.records[0].verified=true;
 expect(workloadEvidence(lesson,[],[],current).scope).toMatchObject({label:'問1〜5',units:5,source:expect.stringContaining('official-audit r1')});
 current.proposalImport.records[0].identity='old';
 expect(workloadEvidence(lesson,[],[],current).scope).toBeNull();
});

it('sends a grounded estimate to the existing schedule validation without mutating tasks or asserting progress',()=>{
 const input={current:null,previous:null,autoRevision:0,today,observedAt:now,confirmedCapacities:{[today]:40},binding,
  tasks:[task,{...peers,status:'completed' as const}].map(task=>({task,createdAt:now-10,updatedAt:now-10}))};
 const before=structuredClone(input.tasks);
 const evaluation=tutorInput(input,[task.unit]);
 expect(evaluation.placements).toHaveLength(1);
 expect(evaluation.data.tasks[0].progress).toBeNull();
 const {candidate,targetRounds}=validateTutorPlan(input,evaluation,evaluation.placements,'tutor-plan',1,now)!;
 expect(candidate.notes.join(' ')).toContain('仮見積 14分');
 expect(candidate.provisional).toBe(true);
 const adoption=mergeTutorSchedule({...input,candidate,targetRounds,now,
  source:{planId:'tutor-plan',revision:1,baseVersion:null,digest:'b'.repeat(64)}});
 expect(adoption.plan?.items[0].ranges[0]).toMatchObject({units:5,minutes:14,day:today});
 expect(input.tasks).toEqual(before);
 expect(tutorInput({...input,tasks:[{...input.tasks[0],task:{...task,status:'in_progress'}},input.tasks[1]]},[task.unit]).placements).toEqual([]);
});

it('renders a bulk review and sends confirmed workload changes to replan without changing a deadline or history',()=>{
 const unknown={...task,id:'pending',title:'練習問題',status:'in_progress' as const,history:[{duration:120}],planning:{...emptyPlan(),deadline:today}};
 const markup=renderToStaticMarkup(createElement(WorkloadReview,{tasks:[task,unknown],plan:null,disabled:false,active:()=>true,onConfirm:async()=>{}}));
 expect(markup).toContain('入力済み0件を確定して保存');
 expect(markup).toContain('登録済み課題名の明示範囲');
 expect(markup.match(/予定分数/g)).toHaveLength(2);
 const planning=confirmedWorkload(unknown,'confirmed-range','問2〜4',3,20);
 expect(planning).toMatchObject({deadline:today,ranges:[{id:'confirmed-range',day:'',done:false,graded:false,corrected:false}]});
 const row={taskId:unknown.id,unit:unknown.unit,status:unknown.status,createdAt:now-20,updatedAt:now-10};
 const before={...row,...replanSnapshot(unknown,null,undefined,today)};
 const after={...row,updatedAt:now,...replanSnapshot({...unknown,planning},null,undefined,today)};
 expect(detectReplan([after],{snapshot:[before],replanEvents:[]},[],[]).map(e=>e.kind)).toEqual(['workload_changed']);
 const input={current:null,previous:null,autoRevision:0,today,observedAt:now,confirmedCapacities:{[today]:40},binding,
  tasks:[{task:{...unknown,planning},createdAt:now-20,updatedAt:now}]};
 const evaluation=tutorInput(input,[unknown.unit]);
 expect(evaluation.diagnostics[0].workload.time?.kind).toBe('registered');
 expect(evaluation.placements).toHaveLength(1);
 expect(input.tasks[0].task.history).toEqual(unknown.history);
 expect(()=>confirmedWorkload({...unknown,isRunning:true},'range','問1',1,5)).toThrow('学習状態');
 expect(()=>confirmedWorkload({...unknown,planning},'other','問1',1,5)).toThrow('既存計画');
});
