import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {DEFAULT_CALENDAR} from '../../src/planning/events';
import {bookedScheduleMinutes,measuredProgress} from '../../src/planning/gantt-display';
import {addDays,validDay,type PlanningTask} from '../../src/planning/model';
import {oldItem} from '../../src/planning/official-schedule';
import {canonical,materialKey,parseSchedule,scheduleId,type LearningSchedule,type ScheduleItem} from '../../src/planning/schedule';
import {mergeTutorSchedule,tutorScheduleProtection} from '../../src/planning/schedule-sync';
import {SUBJECTS} from '../../src/review/model';
import {publishReady,writeJsonAtomic} from './manifest';

type Snapshot={taskId:string;unit:string;status:PlanningTask['status'];createdAt:number;updatedAt:number;progressDigest?:string;overdueDay?:string|null};
export type PriorReport={snapshot?:Snapshot[];newlyRegistered?:Snapshot[];changedTasks?:Snapshot[];newRounds?:string[];replanEvents?:ReplanEvent[];replanRounds?:string[]};
export type ReplanEvent={kind:'round_added'|'task_added'|'completed'|'progress_changed'|'overdue';unit:string;taskId:string;at:number;deadline?:string};
type RequestStatus='requested'|'running'|'no_safe_plan'|'cli_failed'|'failed'|'published';
type Request={id:string;observedAt:string;events:ReplanEvent[];baseVersion:string|null;status:RequestStatus;reason?:string;revision?:number;
 rounds:string[];eligibleTasks:number;capacityDays:number;placeable:number;cliStarted:boolean};
type MergeInput=Parameters<typeof mergeTutorSchedule>[0];
type ReplanInput=Pick<MergeInput,'current'|'previous'|'autoRevision'|'tasks'|'binding'|'today'|'confirmedCapacities'|'observedAt'>;
type Placement={task:number;days:string[]};
type UnplacedReason='capacity'|'missing_work'|'overdue'|'protected'|'other'|'placeable';
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

export async function trackedReplanRounds(stateDir:string,prior:PriorReport|null,events:ReplanEvent[]){
 const rounds=new Set(prior?.replanRounds??[]);
 if(!prior?.replanRounds){
  const folder=resolve(stateDir,'requests');
  const files=await readdir(folder).catch((error:NodeJS.ErrnoException)=>{
   if(error.code==='ENOENT')return [];
   throw error;
  });
  for(const file of files.filter(name=>/^[a-f0-9]{64}\.json$/.test(name))){
   const request=JSON.parse(await readFile(resolve(folder,file),'utf8')) as Partial<Request>;
   for(const event of request.events??[])rounds.add(event.unit);
  }
 }
 for(const event of events)rounds.add(event.unit);
 return [...rounds].sort();
}

function requestTutor(executable:string,data:unknown,onStart:()=>void){
 const prompt='Assign study dates using the numeric task and range indices and JSON data below. Do not use tools. '
  +'Priority: upcoming deadlines, gaps in progress, then distribute work within capacity. '
  +'available is minutes remaining after existing bookings. seed is a feasible assignment you can keep or improve. '
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
  child.once('spawn',onStart);
  child.stdin?.on('error',()=>{});
  child.stdin?.end(prompt+JSON.stringify(data),'utf8');
 });
}

export function replanCapacities(today:string,adopted:Record<string,number>,confirmed:Record<string,number>){
 const weekdayMinutes=[20,10,25,10,40,15,30];
 return Object.fromEntries(Array.from({length:7},(_,offset)=>{
  const day=addDays(today,offset);
  return [day,confirmed[day]??adopted[day]??weekdayMinutes[new Date(day).getUTCDay()]];
 }));
}

function placementDays(ranges:ScheduleItem['ranges'],available:Record<string,number>,deadline:string|null){
 const free=Object.entries(available).filter(([day,minutes])=>minutes>0&&(!deadline||day<=deadline));
 const needed=ranges.map((r,index)=>({minutes:r.minutes,index})).sort((a,b)=>b.minutes-a.minutes);
 if(needed.reduce((sum,r)=>sum+r.minutes,0)>free.reduce((sum,[,minutes])=>sum+minutes,0))return null;
 const days:string[]=Array(needed.length);
 let visits=0;
 function fit(index:number):boolean{
  if(index===needed.length)return true;
  if(++visits>3000)return false;
  const {minutes,index:range}=needed[index],tried=new Set<number>();
  for(const slot of free){
   const [day,remaining]=slot;
   if(remaining<minutes||tried.has(remaining))continue;
   tried.add(remaining);
   slot[1]-=minutes;days[range]=day;
   if(fit(index+1))return true;
   slot[1]+=minutes;
  }
  return false;
 }
 return fit(0)?days:visits>3000?undefined:null;
}

export function tutorInput(input:ReplanInput,rounds:string[]){
 const {current,tasks,today,confirmedCapacities}=input;
 const adopted=new Map(current?.items.map(i=>[i.taskId,i]));
 const target=new Set(rounds);
 const capacities=replanCapacities(today,current?.capacities??{},confirmedCapacities);
 const booked=bookedScheduleMinutes(tasks.map(e=>e.task),adopted.values());
 const available=Object.fromEntries(Object.entries(capacities).map(([day,limit])=>[day,limit-(booked[day]??0)]));
 const diagnostics:{taskId:string;unit:string;reason:UnplacedReason}[]=[];
 const inputs:{taskId:string;data:unknown}[]=[];
 const options=tasks.flatMap(({task,updatedAt})=>{
  if(!target.has(task.unit))return [];
  const old=adopted.get(task.id),item=old??oldItem(task);
  const fixed=deadlines(task,current,item),deadline=fixed[0]??null;
  const progress=replanSnapshot(task,current,old,today);
  inputs.push({taskId:task.id,data:{unit:task.unit,subject:task.subject,status:task.status,progress,fixed,item,
   manual:task.planning?.wbs&&[task.planning.wbs.startDay,task.planning.wbs.endDay],active:task.isRunning||(task.currentDuration??0)>0,
   fresh:updatedAt<=input.observedAt}});
  if(task.status==='completed'||old&&(old.endDay||old.stages?.length||old.ranges.some(r=>r.day)))return [];
  const row={taskId:task.id,unit:task.unit,reason:'capacity' as UnplacedReason};
  diagnostics.push(row);
  if(tutorScheduleProtection(task,item,old)||Object.values(task.scheduleActuals??{}).some(a=>a.done||a.graded||a.corrected||a.actualDay)||
     task.planning?.ranges?.some(r=>r.actualSeconds))row.reason='protected';
  else if(deadline&&deadline<today)row.reason='overdue';
  else if(!item.ranges.length||item.ranges.some(r=>!Number.isFinite(r.minutes)||r.minutes<1||r.minutes>1440||!Number.isFinite(r.units)||r.units<0.01||r.units>10000))row.reason='missing_work';
  else if(fixed.length>1||!Object.hasOwn(SUBJECTS,task.subject)||item.materialId!==materialKey(task)||item.ranges.length>30||
     item.ranges.some(r=>!scheduleId(r.id)||!r.label.trim()||r.label.length>150))row.reason='other';
  if(row.reason!=='capacity')return [];
  return [{item,deadline,progress:measuredProgress(task,item),old,updatedAt,row}];
 }).sort((a,b)=>(a.deadline??'9999').localeCompare(b.deadline??'9999')||a.item.taskId.localeCompare(b.item.taskId));
 const free={...available},selectedRounds=new Set<string>(),seed:Placement[]=[];
 for(const [task,option] of options.entries()){
  const {item,deadline,row,updatedAt}=option;
  if(updatedAt>input.observedAt||seed.length>=100||selectedRounds.size>=20&&!selectedRounds.has(item.unit)){
   row.reason='other';continue;
  }
  const days=placementDays(item.ranges,free,deadline);
  if(!days){if(days===undefined)row.reason='other';continue;}
  for(const [index,range] of item.ranges.entries())free[days[index]]-=range.minutes;
  row.reason='placeable';selectedRounds.add(item.unit);seed.push({task,days});
 }
 const safeOptions=seed.map(({task})=>options[task]);
 const placements=seed.map(({days},task)=>({task,days}));
 const fingerprint=digest({version:2,rounds,base:current?[current.planId,current.revision]:null,
  tasks:inputs.sort((a,b)=>a.taskId.localeCompare(b.taskId)),
  ...(options.length?{capacities,available}:{}),
 });
 return {capacities,options:safeOptions,placements,diagnostics,fingerprint,eligibleTasks:options.length,
  capacityDays:Object.values(capacities).filter(m=>m>0).length,
  data:{today,available,seed:placements,
   tasks:safeOptions.map(({item,deadline,progress},task)=>({task,round:rounds.indexOf(item.unit),subject:item.subject,deadline,progress,
    ranges:item.ranges.map(({minutes})=>({minutes}))})),
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

export async function handleReplan(options:{stateDir:string;root:string;executable?:string;events:ReplanEvent[];rounds:string[];input:ReplanInput;
 available:ReturnType<typeof tutorInput>;
 source?:{planId:string;revision:number};stillCurrent:()=>Promise<boolean>}){
 const {stateDir,root,executable,events,rounds,input,source,stillCurrent,available}=options;
 if(!rounds.length)return null;
 const id=available.fingerprint,folder=resolve(stateDir,'requests'),path=resolve(folder,id+'.json');
 await mkdir(folder,{recursive:true});
 const request:Request={id,observedAt:new Date(input.observedAt).toISOString(),events,
  baseVersion:input.current?input.current.planId+'--r'+input.current.revision:null,status:'requested',rounds,
  eligibleTasks:available.eligibleTasks,capacityDays:available.capacityDays,placeable:available.placements.length,cliStarted:false};
 try{await writeJsonAtomic(path,request,true);}
 catch(error){
  if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
  const existing=JSON.parse(await readFile(path,'utf8')) as Request;
  return {id,status:existing.status,duplicate:true};
 }
 if(!request.placeable){
  request.status='no_safe_plan';
  request.reason=!request.eligibleTasks?'保護条件を満たし、範囲と所要時間が確認できる未配置課題がありません。':'確認済み範囲を期限内の空き枠に配置できません。';
  await writeJsonAtomic(path,request);
  return {id,status:request.status};
 }
 if(!executable)return {id,status:request.status};
 request.status='running';
 await writeJsonAtomic(path,request);
 let answer:unknown;
 try{answer=await requestTutor(executable,available.data,()=>{request.cliStarted=true;});}
 catch(error){
  request.status='cli_failed';
  request.reason=error instanceof Error?error.message:'家庭教師CLIの実行に失敗しました。';
  await writeJsonAtomic(path,request);
  return {id,status:request.status};
 }
 try{
  const planId=source?.planId??input.previous?.source?.planId??input.current?.planId??'tutor-replan-v1';
  const revision=Math.max(source?.revision??0,input.previous?.source?.revision??0,input.current?.planId===planId?input.current.revision:0)+1;
  const now=Date.now();
  let proposed:ReturnType<typeof validateTutorPlan>=null;
  try{proposed=validateTutorPlan(input,available,answer,planId,revision,now);}
  catch{request.reason='家庭教師の提案が照合条件を満たさず、確認済みの配置を使用しました。';}
  const plan=proposed?.candidate.items.length===request.placeable?proposed:validateTutorPlan(input,available,available.placements,planId,revision,now);
  if(!plan)throw Error('検証できる公開候補がありません。');
  if(!await stillCurrent())throw Error('再計画中に本番または公開元が変わりました。');
  const candidate='02_candidates/auto-replan-r'+revision+'-'+id.slice(0,16)+'.json';
  await mkdir(resolve(root,'02_candidates'),{recursive:true});
  const sha256=createHash('sha256').update(JSON.stringify(plan.candidate,null,2)+'\n').digest('hex');
  await writeJsonAtomic(resolve(root,candidate),plan.candidate,true);
  await publishReady(root,candidate,request.observedAt,plan.targetRounds,sha256);
  request.status='published';request.revision=revision;
 }catch(error){
  request.status='failed';
  request.reason=error instanceof Error&&/[ぁ-龯]/.test(error.message)?error.message.slice(0,160):'家庭教師候補の作成または公開に失敗しました。';
 }
 await writeJsonAtomic(path,request);
 return {id,status:request.status,revision:request.revision};
}
