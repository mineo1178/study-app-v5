import CATALOG_DISPLAY from './material-catalog.generated.json';
import type {PlanningTask} from './model';

export type MaterialBinding={schemaVersion:1;revision:number;materialId:string|null;taskIdentity:string;confirmedBy:string;confirmedAt:string};
export const materialTaskIdentity=(t:PlanningTask)=>JSON.stringify([t.id,t.unit,t.subject,t.category,t.materialName,t.title,t.planning?.material?.materialId??null]);
export function bindingFamily(t:PlanningTask){return t.category==='プリント'?/^(確認テスト|計算テスト)[BSA]$/i.exec(t.title.normalize('NFKC').replace(/\s+/g,''))?.[1]??null:null;}
export function bindingCandidates(t:PlanningTask){
 const family=bindingFamily(t);
 if(!family)return [];
 return CATALOG_DISPLAY.filter(m=>m.nameConfirmed&&m.name===family&&t.unit===`第${m.round}回`&&t.subject===m.subject).sort((a,b)=>['BASIC','STANDARD','ADVANCE'].indexOf(a.difficulty??'')-['BASIC','STANDARD','ADVANCE'].indexOf(b.difficulty??'')||a.materialId.localeCompare(b.materialId));
}
export function readBinding(value:unknown,uid:string):MaterialBinding|null{
 if(!value||typeof value!=='object')return null;const b=value as MaterialBinding;
 return b.schemaVersion===1&&Number.isSafeInteger(b.revision)&&b.revision>0&&(b.materialId===null||/^material-[a-f0-9]{64}$/.test(b.materialId))&&typeof b.taskIdentity==='string'&&b.confirmedBy===uid&&typeof b.confirmedAt==='string'&&Number.isFinite(Date.parse(b.confirmedAt))?{schemaVersion:1,revision:b.revision,materialId:b.materialId,taskIdentity:b.taskIdentity,confirmedBy:b.confirmedBy,confirmedAt:b.confirmedAt}:null;
}
export function currentBinding(t:PlanningTask,uid:string){return readBinding(t.materialDisplayBindings?.[uid],uid);}
export function bindingMaterial(t:PlanningTask,b:MaterialBinding|null|undefined){
 return b?.materialId&&b.taskIdentity===materialTaskIdentity(t)?bindingCandidates(t).find(m=>m.materialId===b.materialId)??null:null;
}
export function nextBinding(t:PlanningTask,uid:string,previous:MaterialBinding|null,expectedRevision:number,materialId:string|null,now=new Date().toISOString()):MaterialBinding{
 if(!uid||!t.id||!Number.isFinite(Date.parse(now)))throw Error('利用者・課題・確認日時を確認してください。');
 if((previous?.revision??0)!==expectedRevision)throw Error('別の画面・端末で教材対応が更新されました。詳細を開き直してください。');
 if(materialId!==null&&!bindingCandidates(t).some(m=>m.materialId===materialId))throw Error('回・教科・教材種別に合う候補を選択してください。');
 return {schemaVersion:1,revision:expectedRevision+1,materialId,taskIdentity:materialTaskIdentity(t),confirmedBy:uid,confirmedAt:now};
}
export function projectBinding(t:PlanningTask,b:MaterialBinding|null):PlanningTask{return {...t,displayMaterialBinding:b&&bindingMaterial(t,b)?b:undefined};}
export function bindingDiff(t:PlanningTask,b:MaterialBinding,projectId:string,familyId:string){
 return {schemaVersion:1,kind:'material-binding-diff',exportedAt:new Date().toISOString(),catalogSync:'pending',projectId,familyId,uid:b.confirmedBy,changes:[{taskId:t.id,unit:t.unit,subject:t.subject,category:t.category,originalMaterialName:t.materialName,originalTitle:t.title,binding:b,evidence:'利用者が教材を確認して選択（自動照合ではない）'}]};
}
