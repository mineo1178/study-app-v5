import {catalogMaterialDisplay,catalogCandidateInfo} from './catalog-display';
import type {PlanningTask} from './model';
import {VERIFIED_PRINT_MATERIALS} from './verified-print-materials';

const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,'');
export function printMaterialDisplay(task:PlanningTask){
 const family=/(確認テスト|計算テスト)/.exec(task.title+' '+task.materialName)?.[1];
 const matched=VERIFIED_PRINT_MATERIALS.find(m=>m.name===family&&m.materialId===task.planning?.material?.materialId&&task.unit===`第${m.round}回`&&task.subject===m.subject&&['プリント',m.name].includes(task.category));
 if(matched){const label=matched.name+' '+matched.difficulty+(matched.topic?'（'+matched.topic+'）':'');return{label,group:matched.name,taskLabel:matched.difficulty+(matched.topic?'（'+matched.topic+'）':''),confirmed:true,difficulty:matched.difficulty};}
 const short=normalize(task.title).match(/^(確認テスト|計算テスト)([BSA])$/i);
 if(short&&['プリント',short[1]].includes(task.category)){const group=short[1]+'（種類未確認）',taskLabel='旧登録 '+short[2].toUpperCase()+'（対応未確認）';return{label:group+'／'+taskLabel,group,taskLabel,confirmed:false,difficulty:null};}
 return null;
}
export function taskDisplayName(task:PlanningTask){
 const material=task.materialName||task.category;
 return catalogMaterialDisplay(task)?.label??(printMaterialDisplay(task)?.confirmed?null:printMaterialDisplay(task)?.label)??(material===task.title||material.endsWith(' - '+task.title)||material.endsWith('／'+task.title)?material:material+' ／ '+task.title);
}
export function taskDisplayTitle(task:PlanningTask){
 const display=catalogMaterialDisplay(task),candidate=catalogCandidateInfo(task);
 return taskDisplayName(task)+' ／ 元の登録：'+task.materialName+'／'+task.title+(display?' ／ 台帳の確認済み情報':candidate?' ／ '+candidate.label:'');
}
