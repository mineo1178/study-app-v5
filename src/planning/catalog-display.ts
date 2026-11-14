import metadata from './material-catalog.generated.json';
import type {PlanningTask} from './model';

export const CATALOG_DISPLAY = metadata;
export function catalogMaterialDisplay(task:PlanningTask){
 const row=CATALOG_DISPLAY.find(m=>m.materialId===task.planning?.material?.materialId&&(!m.round||task.unit===`第${m.round}回`)&&(!m.subject||task.subject===m.subject)&&['プリント',m.name].includes(task.category));
 if(!row)return null;
 const suffix=(row.difficulty?' '+row.difficulty:'')+(row.targetClass?'〔'+row.targetClass+'クラス対象〕':'')+(row.topic?'（'+row.topic+'）':'')+(!row.nameConfirmed?'（正式表題未確認）':'');
 return {label:row.name+suffix,taskLabel:suffix.trim()||row.name,nameConfirmed:row.nameConfirmed};
}
export function catalogCandidateInfo(task:PlanningTask){
 // Candidate facts are not a task/PDF binding, and never use the A/B/S suffix.
 if(task.category!=='プリント'||catalogMaterialDisplay(task))return null;
 const family=/^(確認テスト|計算テスト)[BSA]$/i.exec(task.title.normalize('NFKC').replace(/\s+/g,''))?.[1];
 if(!family)return null;
 const candidates=CATALOG_DISPLAY.filter(m=>m.nameConfirmed&&m.name===family&&task.unit===`第${m.round}回`&&task.subject===m.subject);
 if(!candidates.length)return null;
 const topics=new Set(candidates.map(m=>m.topic));
 const topic=topics.size===1?[...topics][0]:null;
 return {label:'候補資料：'+family+(topic?'（'+topic+'）':'')+'／対応未確認',count:candidates.length};
}
export function registeredNameParts(task:PlanningTask){
 return task.materialName===task.category+' - '+task.title?{material:task.category,assignment:task.title}:null;
}
