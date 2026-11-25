import {createHash,randomUUID} from 'node:crypto';
import {readFile,realpath,rename,writeFile} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {MAX_SCHEDULE_BYTES,parseSchedule} from '../../src/planning/schedule';

const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const manifestName='SYNC_READY.json';
export type ReadyManifest={
 schemaVersion:1;status:'ready';partial:true;path:string;planId:string;revision:number;sha256:string;
 createdAt:string;observedAt:string;rounds:string[];provisional:boolean;unconfirmed:string[];
};

export async function writeJsonAtomic(path:string,value:unknown){
 const staging=path+'.'+randomUUID()+'.tmp';
 await writeFile(staging,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 await rename(staging,path);
}

async function candidateAt(root:string,path:string){
 if(typeof path!=='string'||!/^02_candidates\/[\w.-]+\.json$/.test(path))throw Error('公開ファイルは02_candidates直下のJSONを指定してください。');
 const allowed=await realpath(resolve(root,'02_candidates'));
 const configured=resolve(await realpath(root),'02_candidates');
 const actual=await realpath(resolve(root,path));
 if(relative(configured,allowed)!==''||relative(allowed,actual)!==path.split('/')[1]||
    isAbsolute(relative(allowed,actual))||relative(allowed,actual).includes(sep))throw Error('公開候補の実ファイルが候補フォルダの外にあります。');
 const bytes=await readFile(actual);
 if(bytes.length>MAX_SCHEDULE_BYTES)throw Error('公開候補が500KBを超えています。');
 return {candidate:parseSchedule(bytes.toString('utf8')),sha256:digest(bytes)};
}

export async function readReady(root:string,now=Date.now()){
 let raw:string;
 try{raw=await readFile(resolve(root,manifestName),'utf8');}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 if(raw.length>30000)throw Error('公開マニフェストが大きすぎます。');
 const m=JSON.parse(raw) as ReadyManifest;
 if(m?.status!=='ready')return null;
 if(m.schemaVersion!==1||m.partial!==true||!Array.isArray(m.rounds)||!m.rounds.length||m.rounds.length>20||
   new Set(m.rounds).size!==m.rounds.length||m.rounds.some(r=>typeof r!=='string'||r.length>100)||
   !Array.isArray(m.unconfirmed)||m.unconfirmed.length>30||m.unconfirmed.some(n=>typeof n!=='string'||n.length>600)){
  throw Error('readyマニフェストの形式を確認してください。');
 }
 const {candidate,sha256}=await candidateAt(root,m.path);
 const observedAt=Date.parse(m.observedAt),createdAt=Date.parse(m.createdAt);
 if(m.sha256!==sha256||candidate.planId!==m.planId||candidate.revision!==m.revision||
   m.createdAt!==candidate.generatedAt||m.provisional!==candidate.provisional||!Number.isFinite(observedAt)||
   !Number.isFinite(createdAt)||observedAt>createdAt||createdAt>now+60000||
   m.rounds.some(r=>!candidate.scope.some(s=>s.unit===r))){
  throw Error('公開元のSHA-256・revision・対象回・取得日時が一致しません。');
 }
 return {manifest:m,candidate,observedAt,source:{planId:m.planId,revision:m.revision,digest:m.sha256,baseVersion:candidate.baseVersion??null}};
}

export async function publishReady(root:string,path:string,observedAt:string,rounds:string[]){
 const {candidate,sha256}=await candidateAt(root,path);
 if(!candidate.accountBinding||candidate.sync||candidate.proposalImport||candidate.confirmedCapacityDays!==undefined||candidate.items.some(i=>i.stages?.length)||
    !rounds.length||new Set(rounds).size!==rounds.length||rounds.some(r=>!candidate.scope.some(s=>s.unit===r))||
    !Number.isFinite(Date.parse(observedAt))||Date.parse(observedAt)>Date.parse(candidate.generatedAt)||Date.parse(candidate.generatedAt)>Date.now()+60000){
  throw Error('検証済みの部分計画・本番データ取得日時・対象回を指定してください。');
 }
 const previous=await readReady(root);
 if(previous&&(previous.manifest.planId!==candidate.planId||previous.manifest.revision>candidate.revision||
   previous.manifest.revision===candidate.revision&&previous.manifest.sha256!==sha256)){
  throw Error('公開済みの計画系列・revision・内容は変更できません。');
 }
 const manifest:ReadyManifest={
  schemaVersion:1,status:'ready',partial:true,path,planId:candidate.planId,revision:candidate.revision,
  sha256,createdAt:candidate.generatedAt,observedAt,rounds,provisional:candidate.provisional,unconfirmed:candidate.gaps,
 };
 if(previous&&previous.manifest.revision===candidate.revision&&JSON.stringify(previous.manifest)!==JSON.stringify(manifest)){
  throw Error('同じrevisionの公開条件は変更できません。');
 }
 if(!previous||previous.manifest.revision!==candidate.revision)await writeJsonAtomic(resolve(root,manifestName),manifest);
 return manifest;
}
