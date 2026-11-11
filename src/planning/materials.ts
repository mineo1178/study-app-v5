import { SUBJECTS, type Subject } from "../review/model";
import { emptyPlan, type PlanningTask } from "./model";
export type Material = { materialId: string; title: string; unit: string; subject: Subject; category: string; requirement: "required" | "reinforcement" | "advanced" | "unconfirmed"; references: { name: string; sha256: string; role: "problem" | "answer" | "related" }[] };
export function parseMaterials(raw: string): Material[] {
  if (raw.length > 200000) throw new Error("教材一覧は200,000文字までです。");
  const value=JSON.parse(raw);
  if(value?.schemaVersion!==1 || !Array.isArray(value.materials) || !value.materials.length || value.materials.length>100) throw new Error("schemaVersion 1 の教材一覧を選んでください。");
  const materials: Material[]=value.materials.map((m: Material)=>{
    if(!m || !/^material-[a-f0-9]{64}$/.test(m.materialId) || !Object.hasOwn(SUBJECTS,m.subject) || ![m.title,m.unit,m.category].every(t=>typeof t==='string' && t.trim() && t.length<=150) || !['required','reinforcement','advanced','unconfirmed'].includes(m.requirement) || !Array.isArray(m.references) || !m.references.length || m.references.length>20 || m.references.some(r=>!r || typeof r.name!=='string' || !r.name.trim() || r.name.length>200 || /[\\/:]/.test(r.name) || !/^[a-f0-9]{64}$/.test(r.sha256) || !['problem','answer','related'].includes(r.role))) throw new Error("教科・回・教材名・内容ハッシュ・関連資料を確認してください。パスは取り込めません。");
    if(!m.references.some(r=>m.materialId==='material-'+r.sha256)) throw new Error("materialIdは主要資料の内容ハッシュにしてください。");
    return {materialId:m.materialId,title:m.title.trim(),unit:m.unit.trim(),subject:m.subject,category:m.category.trim(),requirement:m.requirement,references:m.references.map(r=>({name:r.name,sha256:r.sha256,role:r.role}))};
  });
  const hashes=materials.flatMap(m=>m.references.map(r=>r.sha256));
  if(new Set(materials.map(m=>m.materialId)).size!==materials.length || new Set(hashes).size!==hashes.length) throw new Error("重複PDFがあります。同じ教材の関連資料にまとめてください。");
  return materials;
}
export const materialInfo=(m: Material)=>{if(m.requirement==='unconfirmed')throw new Error('必須・補強・発展を確認してください。');return {materialId:m.materialId,title:m.title,requirement:m.requirement,selected:true,references:m.references.map(r=>r.role+': '+r.name)};};
export function newMaterialTask(m: Material, at=Date.now()) {
  return { id:m.materialId,unit:m.unit,subject:m.subject,category:m.category,title:m.title,materialName:m.title,status:'not_started' as const,currentDuration:0,sessionStartTime:null,isRunning:false,lastUpdatedAt:at,currentMemo:'',history:[],createdAt:new Date(at).toISOString(),planning:{...emptyPlan(),revision:1,material:materialInfo(m)} };
}
export function matchingMaterialTask(m: Material,tasks: PlanningTask[]) { return tasks.find(t=>t.planning?.material?.materialId===m.materialId); }
