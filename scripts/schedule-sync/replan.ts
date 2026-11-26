import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {DEFAULT_CALENDAR} from '../../src/planning/events';
import {bookedScheduleMinutes,measuredProgress} from '../../src/planning/gantt-display';
import {validDay,type PlanningTask} from '../../src/planning/model';
import {oldItem} from '../../src/planning/official-schedule';
import {canonical,materialKey,parseSchedule,type LearningSchedule,type ScheduleItem} from '../../src/planning/schedule';
import {mergeTutorSchedule,tutorScheduleProtection} from '../../src/planning/schedule-sync';
import {SUBJECTS} from '../../src/review/model';
import {publishReady,writeJsonAtomic} from './manifest';

type Snapshot={taskId:string;unit:string;status:PlanningTask['status'];createdAt:number;updatedAt:number;progressDigest?:string;overdueDay?:string|null};
export type PriorReport={snapshot?:Snapshot[];newlyRegistered?:Snapshot[];changedTasks?:Snapshot[];newRounds?:string[];replanEvents?:ReplanEvent[]};
export type ReplanEvent={kind:'round_added'|'task_added'|'completed'|'progress_changed'|'overdue';unit:string;taskId:string;at:number;deadline?:string};
type RequestStatus='requested'|'running'|'no_safe_plan'|'failed'|'published';
type Request={id:string;observedAt:string;events:ReplanEvent[];baseVersion:string|null;status:RequestStatus;reason?:string;revision?:number;
 eligibleTasks?:number;capacityDays?:number};
type MergeInput=Parameters<typeof mergeTutorSchedule>[0];
type ReplanInput=Pick<MergeInput,'current'|'previous'|'autoRevision'|'tasks'|'binding'|'today'|'confirmedCapacities'|'observedAt'>;
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');

function deadlines(task:PlanningTask,current:LearningSchedule|null,item?:ScheduleItem){
 return [...new Set([task.planning?.deadline,item?.deadline,
  ...current?.scope.filter(s=>s.unit===task.unit&&s.subjects.some(subject=>subject===task.subject)).map(s=>s.deadline)??[],
  DEFAULT_CALENDAR.deadlines.find(s=>s.unit===task.unit&&s.confirmed)?.day,
 ].filter((day):day is string=>!!day&&validDay(day)))].sort();
}

export function replanSnapshot(task:PlanningTask,current:LearningSchedule|null,item:ScheduleItem|undefined,today:string){
 const planning=task.planning;
 const deadline=deadlines(task,current,item)[0];
 return {progressDigest:digest({status:task.status,history:task.history.filter(h=>!h.operationCheck),actuals:task.scheduleActuals,
  measurement:planning?.questionMeasurement,progress:planning?.wbs?.progress,
  ranges:planning?.ranges?.filter(r=>r.done||r.graded||r.corrected||r.actualDay||r.actualSeconds)
   .map(({id,done,graded,corrected,actualDay,actualSeconds})=>({id,done,graded,corrected,actualDay,actualSeconds})),
 }),overdueDay:task.status!=='completed'&&deadline&&deadline<today?deadline:null};
}

export function detectReplan(snapshot:Snapshot[],prior:PriorReport|null,newlyRegistered:Snapshot[],newRounds:string[]){
 const old=new Map(prior?.snapshot?.map(r=>[r.taskId,r]));
 const added=new Set([...newlyRegistered,...(!prior?.replanEvents?prior?.newlyRegistered??[]:[])].map(r=>r.taskId));
 const changed=new Set(!prior?.replanEvents?prior?.changedTasks?.map(r=>r.taskId):[]);
 const rounds=new Set([...newRounds,...(!prior?.replanEvents?prior?.newRounds??[]:[])]);
 const events:ReplanEvent[]=[];
 for(const row of [...snapshot].sort((a,b)=>a.createdAt-b.createdAt||a.taskId.localeCompare(b.taskId))){
  const before=old.get(row.taskId);
  const {taskId,unit}=row;
  if(added.has(taskId)){
   events.push({kind:'task_added',taskId,unit,at:row.createdAt});
   if(rounds.delete(unit))events.push({kind:'round_added',taskId,unit,at:row.createdAt});
  }else if((before&&before.status!==row.status||changed.has(taskId))&&row.status==='completed'){
   events.push({kind:'completed',taskId,unit,at:row.updatedAt});
  }else if(changed.has(taskId)||before&&(before.status!==row.status||
   (before.progressDigest===undefined?before.updatedAt!==row.updatedAt:before.progressDigest!==row.progressDigest))){
   events.push({kind:'progress_changed',taskId,unit,at:row.updatedAt});
  }
  if(row.overdueDay&&row.overdueDay!==before?.overdueDay){
   events.push({kind:'overdue',taskId,unit,at:Date.parse(row.overdueDay+'T15:00:00Z'),deadline:row.overdueDay});
  }
 }
 return events;
}

function requestTutor(executable:string,data:unknown){
 const prompt='Assign study dates using the numeric task and range indices and JSON data below. Do not use tools. '
  +'Priority: upcoming deadlines, gaps in progress, then distribute work within capacity. '
  +'available is minutes remaining after existing bookings; a selected task releases its old bookings before assigning all its ranges. '
  +'Use only the given dates, ranges and minutes. Respect deadline. Leave a task out if all its ranges cannot fit or no change is warranted. '
  +'Return only a JSON array of {"task":0,"days":["YYYY-MM-DD"]} entries, one day per range in the given order. Return [] if nothing can be scheduled.\n';
 return new Promise<unknown>((done,reject)=>{
  let answer:string|undefined;
  const child=execFile(executable,['--ask-for-approval','never','exec','--ephemeral','--ignore-user-config',
   '--sandbox','read-only','--skip-git-repo-check','--disable','shell_tool','--disable','plugins',
   '-c','web_search="disabled"','-c','mcp_servers={}','--color','never','--json','-'],
   {cwd:tmpdir(),windowsHide:true,timeout:180000,maxBuffer:1024*1024},(error,stdout)=>{
    if(error){reject(Error('家庭教師CLIが終了またはタイムアウトしました。'));return;}
    try{
     for(const line of stdout.trim().split(/\r?\n/)){
      const event=JSON.parse(line);
      if(event.type==='item.completed'&&event.item?.type==='agent_message')answer=event.item.text;
     }
     const json=answer?.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/,'$1');
     done(JSON.parse(json??''));
    }catch{reject(Error('家庭教師の返答をJSONとして検証できません。'));}
   });
  child.stdin?.on('error',()=>{});
  child.stdin?.end(prompt+JSON.stringify(data),'utf8');
 });
}

export function tutorInput(input:ReplanInput,events:ReplanEvent[]){
 const {current,tasks,today,confirmedCapacities}=input;
 const adopted=new Map(current?.items.map(i=>[i.taskId,i]));
 const rounds=new Set(events.map(e=>e.unit));
 const capacities=Object.fromEntries(Object.entries({...current?.capacities,...confirmedCapacities}).filter(([day])=>day>=today));
 const booked=bookedScheduleMinutes(tasks.map(e=>e.task),adopted.values());
 const options=tasks.flatMap(({task,updatedAt})=>{
  if(!rounds.has(task.unit)||!Object.hasOwn(SUBJECTS,task.subject)||updatedAt>input.observedAt)return [];
  const old=adopted.get(task.id),item=old??oldItem(task);
  const fixed=deadlines(task,current,item),deadline=fixed[0]??null;
  if(fixed.length>1||deadline&&deadline<today||!item.ranges.length||
     tutorScheduleProtection(task,item,old)||Object.values(task.scheduleActuals??{}).some(a=>a.done||a.graded||a.corrected||a.actualDay)||
     task.planning?.ranges?.some(r=>r.actualSeconds)||item.materialId!==materialKey(task)||
     item.ranges.some(r=>!Number.isFinite(r.minutes)||r.minutes<1||!Number.isFinite(r.units)||r.units<=0))return [];
  return [{item,deadline,progress:measuredProgress(task,item),old}];
 }).sort((a,b)=>(a.deadline??'9999').localeCompare(b.deadline??'9999')||a.item.taskId.localeCompare(b.item.taskId)).slice(0,100);
 const roundIndices=[...rounds];
 return {capacities,options,data:{today,available:Object.fromEntries(Object.entries(capacities).map(([day,limit])=>[day,limit-(booked[day]??0)])),
  tasks:options.map(({item,deadline,progress},task)=>({task,round:roundIndices.indexOf(item.unit),subject:item.subject,deadline,progress,
   ranges:item.ranges.map(({minutes,day})=>({minutes,oldDay:day}))})),
  changes:events.map(e=>({kind:e.kind,round:roundIndices.indexOf(e.unit),task:options.findIndex(o=>o.item.taskId===e.taskId)})),
 }};
}

export function validateTutorPlan(input:ReplanInput,available:ReturnType<typeof tutorInput>,answer:unknown,planId:string,revision:number,now:number){
 const {options,capacities}=available,items:ScheduleItem[]=[],selected=new Set<number>();
 if(!Array.isArray(answer)||answer.length>options.length)throw Error('家庭教師の課題一覧が不正です。');
 for(const row of answer){
  if(!row||!Number.isInteger(row.task)||!options[row.task]||selected.has(row.task)||Object.keys(row).length!==2)throw Error('家庭教師の課題番号が不正です。');
  selected.add(row.task);
  const {item,deadline,old}=options[row.task];
  if(!Array.isArray(row.days)||row.days.length!==item.ranges.length||row.days.some((day:unknown)=>
   typeof day!=='string'||!Object.hasOwn(capacities,day)||deadline&&day>deadline))throw Error('家庭教師の予定日が確定期限または学習枠と一致しません。');
  const ranges=item.ranges.map((r,i)=>({...r,day:row.days[i] as string}));
  if(old&&ranges.every((r,i)=>r.day===old.ranges[i].day))continue;
  const dailyWork:ScheduleItem['dailyWork']={};
  for(const {day,units,minutes} of ranges){
   dailyWork[day]??={units:0,minutes:0};
   dailyWork[day].units+=units;
   dailyWork[day].minutes+=minutes;
  }
  const {questionGoalCandidate,questionPlan,stages,...original}=item;
  void questionGoalCandidate;void questionPlan;void stages;
  items.push({...original,ranges,dailyWork,deadline:old?old.deadline:deadline,endDay:Object.keys(dailyWork).sort().at(-1)!});
 }
 if(!items.length)return null;
 const scope:LearningSchedule['scope']=[];
 for(const item of items){
  const matching=scope.find(s=>s.unit===item.unit);
  if(!matching)scope.push({unit:item.unit,subjects:[item.subject],deadline:null});
  else if(!matching.subjects.includes(item.subject))matching.subjects.push(item.subject);
 }
 const targetRounds=scope.map(s=>s.unit),baseVersion=input.current?input.current.planId+'--r'+input.current.revision:null;
 const candidate=parseSchedule(JSON.stringify({schemaVersion:'learning-schedule/1',planId,revision,baseVersion,
  generatedAt:new Date(now).toISOString(),accountBinding:input.binding,provisional:true,
  notes:['本番の既存範囲と学習枠に基づく日程案'],gaps:['範囲・所要時間・容量を確認できない課題は既存状態を保持'],
  scope,capacities:Object.fromEntries([...new Set(items.flatMap(i=>Object.keys(i.dailyWork)))].map(day=>[day,capacities[day]])),items,
 }));
 const merged=mergeTutorSchedule({...input,candidate,source:{planId,revision,baseVersion,digest:digest(candidate)},now,targetRounds});
 if(!merged.plan||merged.changed.length!==items.length)throw Error('本番との照合で公開候補の一部を適用できません。');
 return {candidate,targetRounds};
}

export async function handleReplan(options:{stateDir:string;root:string;executable?:string;events:ReplanEvent[];input:ReplanInput;
 source?:{planId:string;revision:number};stillCurrent:()=>Promise<boolean>}){
 const {stateDir,root,executable,events,input,source,stillCurrent}=options;
 if(!events.length)return null;
 const id=digest(events),folder=resolve(stateDir,'requests'),path=resolve(folder,id+'.json');
 await mkdir(folder,{recursive:true});
 const request:Request={id,observedAt:new Date(input.observedAt).toISOString(),events,
  baseVersion:input.current?input.current.planId+'--r'+input.current.revision:null,status:'requested'};
 try{await writeJsonAtomic(path,request,true);}
 catch(error){
  if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
  const existing=JSON.parse(await readFile(path,'utf8')) as Request;
  return {id,status:existing.status};
 }
 if(!executable)return {id,status:request.status};
 request.status='running';
 await writeJsonAtomic(path,request);
 try{
  const available=tutorInput(input,events);
  request.eligibleTasks=available.options.length;
  request.capacityDays=Object.values(available.capacities).filter(m=>m>0).length;
  const planId=source?.planId??input.previous?.source?.planId??input.current?.planId??'tutor-replan-v1';
  const revision=Math.max(source?.revision??0,input.previous?.source?.revision??0,input.current?.planId===planId?input.current.revision:0)+1;
  const answer=request.eligibleTasks&&request.capacityDays?await requestTutor(executable,available.data):[];
  const plan=validateTutorPlan(input,available,answer,planId,revision,Date.now());
  if(!plan){
   request.status='no_safe_plan';
   request.reason=!request.eligibleTasks?'根拠のある未保護の学習範囲がありません。':!request.capacityDays?'今日以降の利用可能な学習枠がありません。':'根拠のある学習範囲と空き枠で変更できる候補がありません。';
  }
  else{
   if(!await stillCurrent())throw Error('再計画中に本番または公開元が変わりました。');
   const candidate='02_candidates/auto-replan-r'+revision+'-'+id.slice(0,16)+'.json';
   await mkdir(resolve(root,'02_candidates'),{recursive:true});
   const sha256=createHash('sha256').update(JSON.stringify(plan.candidate,null,2)+'\n').digest('hex');
   await writeJsonAtomic(resolve(root,candidate),plan.candidate,true);
   await publishReady(root,candidate,request.observedAt,plan.targetRounds,sha256);
   request.status='published';request.revision=revision;
  }
 }catch(error){
  request.status='failed';
  request.reason=error instanceof Error&&/[ぁ-龯]/.test(error.message)?error.message.slice(0,160):'家庭教師候補の作成または公開に失敗しました。';
 }
 await writeJsonAtomic(path,request);
 return {id,status:request.status,revision:request.revision};
}
