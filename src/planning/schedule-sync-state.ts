export const AUTO_SCHEDULE_ID='tutor-sync-v1';
export const SYNC_STATES=['synced','pending','partial','error'] as const;

export type SyncSource={planId:string;revision:number;digest:string;baseVersion:string|null};
export type SyncDecision={taskId:string;kind:'applied'|'waiting'|'held';reason:string};
export type ScheduleSyncProvenance={source:SyncSource;decisions:SyncDecision[]};
export type ScheduleSyncState={
 schemaVersion:1;
 status:typeof SYNC_STATES[number];
 syncedAt:number|null;
 versionId:string|null;
 unplaced:number;
 waiting:number;
 conflicts:number;
 reasons:string[];
 source:SyncSource|null;
 appliedTaskIds:string[];
 waitingTaskIds:string[];
};

const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(n=>Object.hasOwn(x,n));
const planId=(x:unknown)=>typeof x==='string'&&/^[\w-]{1,100}$/.test(x);
const versionId=(x:unknown)=>x===null||typeof x==='string'&&/^[\w-]{1,100}--r[1-9]\d{0,6}$/.test(x);
const taskId=(x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=200&&!x.includes('/');
const digest=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const count=(x:unknown,max:number)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=max;
const reason=(x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=160;
const idArray=(x:unknown):x is string[]=>Array.isArray(x)&&x.length<=100&&new Set(x).size===x.length&&x.every(taskId);

function isSource(x:unknown):x is SyncSource{
 return object(x)&&keys(x,['planId','revision','digest','baseVersion'])&&planId(x.planId)&&count(x.revision,1000000)&&x.revision!==0&&digest(x.digest)&&versionId(x.baseVersion);
}

export function isSyncProvenance(x:unknown):x is ScheduleSyncProvenance{
 return object(x)&&keys(x,['source','decisions'])&&isSource(x.source)&&Array.isArray(x.decisions)&&x.decisions.length<=100
  &&x.decisions.every(d=>object(d)&&keys(d,['taskId','kind','reason'])&&taskId(d.taskId)&&['applied','waiting','held'].includes(String(d.kind))&&reason(d.reason))
  &&new Set(x.decisions.map(d=>d.taskId)).size===x.decisions.length;
}

export function isScheduleSyncState(x:unknown):x is ScheduleSyncState{
 return object(x)&&keys(x,['schemaVersion','status','syncedAt','versionId','unplaced','waiting','conflicts','reasons','source','appliedTaskIds','waitingTaskIds'])
  &&x.schemaVersion===1&&SYNC_STATES.some(s=>s===x.status)&&(x.syncedAt===null||count(x.syncedAt,Number.MAX_SAFE_INTEGER))
  &&versionId(x.versionId)&&count(x.unplaced,1000000)&&count(x.waiting,100)&&count(x.conflicts,100)
  &&Array.isArray(x.reasons)&&x.reasons.length<=12&&x.reasons.every(reason)&&(x.source===null||isSource(x.source))
  &&idArray(x.appliedTaskIds)&&idArray(x.waitingTaskIds)&&x.waiting===x.waitingTaskIds.length;
}
