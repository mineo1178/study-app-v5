import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {deleteApp,initializeApp} from 'firebase/app';
import {collection,doc,getDocFromServer,getDocsFromServer,getFirestore,terminate,type Firestore} from 'firebase/firestore';
import {validDay,type PlanningTask} from '../../src/planning/model';
import {getJstDay} from '../../src/review/model';
import {accountKey,canonical,parseSchedule,scheduleDigest} from '../../src/planning/schedule';
import {importSchedule,saveScheduleSyncState,scheduleCapacityRef,scheduleRoot,scheduleSyncRef,type SchedulePointer,type ScheduleSyncFence} from '../../src/planning/schedule-repository';
import {AUTO_SCHEDULE_ID,isScheduleSyncState} from '../../src/planning/schedule-sync-state';
import {mergeTutorSchedule,type SyncTask} from '../../src/planning/schedule-sync';
import {openScheduleAuth} from './auth';
import {publishReady,readReady,writeJsonAtomic} from './manifest';

type Config={project:string;family:string;uid:string;apiKey:string;integrationRoot:string};
type TaskStamp={name:string;createTime:string;updateTime:string;fields?:{_writeVersion?:{integerValue?:string}}};
type LiveTask=PlanningTask&{_writeVersion?:number;_deletion?:unknown};
const bindingPart=(v:unknown)=>typeof v==='string'&&/^[\w-]{1,128}$/.test(v);
const hash=(x:unknown)=>createHash('sha256').update(canonical(x)).digest('hex');
const reason=(error:unknown)=>error instanceof Error&&error.message.length<=160&&!/[\r\n]/.test(error.message)&&/[ぁ-龯]/.test(error.message)?error.message:'認証・通信または設定を確認してください。';
const errorCode=(error:unknown)=>{
 const code=(error as {code?:unknown}|null)?.code;
 return typeof code==='string'&&/^[\w/-]{1,80}$/.test(code)?code:null;
};

async function localJson<T>(path:string):Promise<T|null>{
 try{return JSON.parse(await readFile(path,'utf8')) as T;}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}

async function activeTasks(db:Firestore,family:string){
 return (await getDocsFromServer(collection(db,'families',family,'tasks'))).docs
  .filter(s=>!s.data()._deletion).map(s=>({id:s.id,raw:s.data() as LiveTask}));
}

async function taskStamps(config:Config,idToken:string){
 const url='https://firestore.googleapis.com/v1/projects/'+config.project+'/databases/(default)/documents/families/'+config.family+':runQuery';
 const response=await fetch(url,{
  method:'POST',headers:{Authorization:'Bearer '+idToken,'Content-Type':'application/json'},
  body:JSON.stringify({structuredQuery:{from:[{collectionId:'tasks'}],select:{fields:[{fieldPath:'_writeVersion'}]}}}),
  signal:AbortSignal.timeout(25000),
 });
 if(!response.ok)throw Error('本番課題の更新時刻を取得できません。HTTP '+response.status);
 const rows=await response.json() as {document?:TaskStamp}[];
 return new Map(rows.flatMap(row=>row.document?[[row.document.name.split('/').at(-1)!,row.document] as const]:[]));
}

function recordedTasks(rows:Awaited<ReturnType<typeof activeTasks>>,stamps:Awaited<ReturnType<typeof taskStamps>>){
 return rows.map(({id,raw}):SyncTask=>{
  const tag=stamps.get(id),updatedAt=Date.parse(tag?.updateTime??''),createdAt=Date.parse(tag?.createTime??'');
  if(!tag||!Number.isFinite(updatedAt)||!Number.isFinite(createdAt)||
     (raw._writeVersion??0)!==Number(tag.fields?._writeVersion?.integerValue??0))throw Error('取得中に課題が変わりました。次回の同期で再確認します。');
  return {task:{...raw,id,history:raw.history??[]},updatedAt,createdAt};
 });
}

function confirmedCapacities(raw:unknown){
 if(raw===undefined)return {};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('本番の日別学習枠の形式を確認してください。');
 const out:Record<string,number>={};
 for(const [day,minutes]of Object.entries(raw)){
  if(!validDay(day)||!Number.isInteger(minutes)||minutes<0||minutes>1440)throw Error('本番の日別学習枠の形式を確認してください。');
  out[day]=minutes;
 }
 return out;
}

async function synchronize(config:Config,stateDir:string,mode:string){
 const app=initializeApp({apiKey:config.apiKey,projectId:config.project},'study-schedule-sync');
 const db=getFirestore(app);
 const {project,family,uid}=config;
 try{
  const {user,active}=await openScheduleAuth(app,resolve(stateDir,'auth.dpapi'),uid,mode==='connect');
  const owner={uid,active,binding:await accountKey(project,family,uid)};
  const root=scheduleRoot(db,family,uid);
  if(mode==='connect'){
   await getDocFromServer(root);
   console.log('対象アカウントで接続しました。採用状態を読めることを確認しました。');
   return;
  }
  const [head,status,capacity,ledger]=await Promise.all([
   getDocFromServer(root),getDocFromServer(scheduleSyncRef(db,family,uid)),
   getDocFromServer(scheduleCapacityRef(db,family,uid)),getDocFromServer(doc(root,'ledgers',AUTO_SCHEDULE_ID)),
  ]);
  const pointer=head.data() as SchedulePointer|undefined,rawState=status.data();
  if(rawState&&!isScheduleSyncState(rawState))throw Error('本番同期状態の形式が不正です。');
  const previous=rawState??null;
  const saved=pointer?await getDocFromServer(doc(root,'plans',pointer.versionId)):null;
  const current=saved?.exists()?parseSchedule(JSON.stringify(saved.data().plan)):null;
  if(pointer&&(!current||current.accountBinding!==owner.binding||current.planId!==pointer.planId||
     current.revision!==pointer.revision||await scheduleDigest(current)!==pointer.digest)){
   throw Error('現在の採用計画・digest・認証アカウントが一致しません。');
  }
  const now=Date.now();
  const [rows,stamps]=await Promise.all([activeTasks(db,family),taskStamps(config,await user.getIdToken())]);
  const tasks=recordedTasks(rows,stamps),rawTasks=new Map(rows.map(r=>[r.id,r.raw]));
  const apply=mode==='apply';
  const fence:ScheduleSyncFence={
   pointer:pointer??null,previous,next:{
    schemaVersion:1,status:'pending',syncedAt:previous?.syncedAt??null,versionId:pointer?.versionId??null,
    unplaced:previous?.unplaced??0,waiting:0,conflicts:0,reasons:['公開済み計画の更新待ち'],
    source:null,appliedTaskIds:[],waitingTaskIds:[],
   },capacities:capacity.data()??null,taskDigests:new Map(),
  };
  let result:ReturnType<typeof mergeTutorSchedule>|undefined;
  let ready:Awaited<ReturnType<typeof readReady>>=null;
  try{
   ready=await readReady(config.integrationRoot,now);
   if(ready){
    result=mergeTutorSchedule({...ready,current,previous,tasks,binding:owner.binding,now,today:getJstDay(now),
     confirmedCapacities:confirmedCapacities(capacity.data()?.capacities),autoRevision:Number(ledger.data()?.revision??0),
     targetRounds:ready.manifest.rounds});
   }
  }catch(error){
   fence.next={...previous??fence.next,status:'error',versionId:pointer?.versionId??null,reasons:[reason(error)]};
   if(apply&&(!previous||previous.versionId===fence.next.versionId))await saveScheduleSyncState(db,family,owner,fence);
   throw error;
  }
  const snapshot=tasks.map(({task,createdAt,updatedAt})=>({taskId:task.id,unit:task.unit,subject:task.subject,category:task.category,materialName:task.materialName,title:task.title,status:task.status,createdAt,updatedAt}));
  const reportPath=resolve(stateDir,'LATEST_DIFF.json');
  const priorReport=await localJson<{snapshot?:typeof snapshot;source?:{sha256:string}}>(reportPath);
  const oldSnapshots=new Map(priorReport?.snapshot?.map(r=>[r.taskId,r]));
  const changedTasks=snapshot.filter(r=>{const old=oldSnapshots.get(r.taskId);return old&&(old.updatedAt!==r.updatedAt||old.status!==r.status);});
  const newlyRegistered=snapshot.filter(r=>priorReport?.snapshot?!oldSnapshots.has(r.taskId):r.createdAt>(ready?.observedAt??now));
  const previousRounds=new Set(priorReport?.snapshot?.map(r=>r.unit)??snapshot.filter(r=>!newlyRegistered.includes(r)).map(r=>r.unit));
  const newRounds=[...new Set(newlyRegistered.map(r=>r.unit))].filter(unit=>!previousRounds.has(unit));
  const taskHashes=()=>Object.fromEntries(rows.map(r=>[r.id,hash(r.raw)]));
  let productionWrites=0;
  if(result){
   fence.next=result.state;
   if(result.plan&&apply){
    const auditId=result.plan.planId+'--r'+result.plan.revision+'-'+now;
    const before={at:new Date(now).toISOString(),pointer:pointer??null,taskHashes:taskHashes()};
    await writeJsonAtomic(resolve(stateDir,auditId+'.before.json'),before);
    fence.taskDigests=new Map(result.plan.items.map(i=>[i.taskId,canonical(rawTasks.get(i.taskId))]));
    try{await importSchedule(db,family,owner,result.plan,fence);}
    catch(error){
     const details=error instanceof Error?error.message.replace(/[\r\n]+/g,' ').replace(/[A-Za-z0-9_-]{70,}/g,'[ID]').slice(0,220):'';
     await writeJsonAtomic(resolve(stateDir,'LAST_TRANSACTION_ERROR.json'),{at:new Date().toISOString(),code:errorCode(error),details});
     throw error;
    }
    productionWrites=4;
    const [after,newRows]=await Promise.all([getDocFromServer(root),activeTasks(db,family)]);
    const updatedPointer=after.data() as SchedulePointer|undefined;
    const version=updatedPointer?await getDocFromServer(doc(root,'plans',updatedPointer.versionId)):null;
    const stored=version?.exists()?parseSchedule(JSON.stringify(version.data().plan)):null;
    const matches=!!stored&&updatedPointer?.versionId===result.state.versionId&&
     await scheduleDigest(stored)===await scheduleDigest(result.plan)&&updatedPointer?.digest===await scheduleDigest(stored);
    const afterHashes=Object.fromEntries(newRows.map(r=>[r.id,hash(r.raw)]));
    await writeJsonAtomic(resolve(stateDir,auditId+'.after.json'),{at:new Date().toISOString(),updatedPointer,taskHashes:afterHashes,unchanged:canonical(afterHashes)===canonical(before.taskHashes),matches});
    if(!matches)throw Error('保存後の本番revisionの照合が必要です。');
   }else if(!result.plan&&apply&&await saveScheduleSyncState(db,family,owner,fence))productionWrites=1;
  }else if(apply&&!previous&&await saveScheduleSyncState(db,family,owner,fence))productionWrites=1;
  const report={checkedAt:new Date(now).toISOString(),mode,productionWrites,
   currentVersionId:productionWrites===4?result?.state.versionId:pointer?.versionId??null,
   source:ready?.manifest??null,state:result?.state??previous??fence.next,minutes:result?.minutes??{},
   newRounds,newlyRegistered,changedTasks,unplaced:result?.unplaced??[],classifications:result?.classifications??[],
   replan:result?.classifications.filter(r=>['unplaced','waiting','held'].includes(r.outcome))??[],snapshot,
  };
  if(!priorReport||productionWrites>0||newlyRegistered.length||changedTasks.length||priorReport.source?.sha256!==ready?.manifest.sha256){
   const history=resolve(stateDir,'reports');
   await mkdir(history,{recursive:true});
   await writeJsonAtomic(resolve(history,report.checkedAt.replace(/[:.]/g,'-')+'.json'),report);
  }
  await writeJsonAtomic(reportPath,report);
  await writeJsonAtomic(resolve(stateDir,'LAST_RUN.json'),{status:'ok',at:report.checkedAt,mode,productionWrites,versionId:report.currentVersionId});
  console.log(JSON.stringify({status:report.state.status,version:report.currentVersionId,productionWrites,
   applied:result?.changed.length??0,unplaced:report.state.unplaced,waiting:report.state.waiting,conflicts:report.state.conflicts}));
 }finally{await terminate(db);await deleteApp(app);}
}

async function main(){
 const [mode,path,...args]=process.argv.slice(2);
 if(mode==='publish'&&path&&args.length>=3){
  const [candidate,observedAt,...rounds]=args;
  const manifest=await publishReady(path,candidate,observedAt,rounds);
  console.log(JSON.stringify({status:manifest.status,planId:manifest.planId,revision:manifest.revision,sha256:manifest.sha256}));
  return;
 }
 if(!path||!['connect','check','apply'].includes(mode)||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST){
  throw Error('同期には設定ファイルと connect・check・apply のいずれかを指定してください。');
 }
 const config=await localJson<Config>(path);
 if(!config||config.project!=='study-app-v5'||!bindingPart(config.family)||!bindingPart(config.uid)||
    !/^AIza[\w-]{30,}$/.test(config.apiKey)||!isAbsolute(config.integrationRoot)){
  throw Error('本番project・対象家族・既存利用者の同期設定を確認してください。');
 }
 const stateDir=resolve(config.integrationRoot,'04_private','schedule-sync');
 try{await synchronize(config,stateDir,mode);}
 catch(error){
  await writeJsonAtomic(resolve(stateDir,'LAST_RUN.json'),{status:'error',at:new Date().toISOString(),mode,code:errorCode(error),reason:reason(error)});
  throw error;
 }
}

void main().catch(error=>{console.error(errorCode(error)??'',reason(error));process.exitCode=1;});
