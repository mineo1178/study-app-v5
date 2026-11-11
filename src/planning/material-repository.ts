import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { emptyPlan } from "./model";
import { materialInfo, newMaterialTask, type Material } from "./materials";
export async function registerMaterial(db: Firestore, family: string, material: Material, taskId: string | null, active:()=>boolean) {
  const id=taskId??material.materialId;
  return runTransaction(db,async tx=>{
    const binding=doc(db,'families',family,'studyMaterials',material.materialId), ref=doc(db,'families',family,'tasks',id);
    const fileRefs=material.references.map(r=>doc(db,'families',family,'studyMaterialFiles',r.sha256));
    const [linked,task,...files]=await Promise.all([tx.get(binding),tx.get(ref),...fileRefs.map(r=>tx.get(r))]);
    if(files.some(file=>file.exists() && file.data().materialId!==material.materialId))throw new Error('同じPDFが別の教材に登録されています。既存教材へまとめてください。');
    if(!active()) throw new Error('利用者が切り替わりました。');
    if(linked.exists() && linked.data().taskId!==id) throw new Error('この教材はすでに別のタスクに登録されています。再読込してください。');
    if(taskId && (!task.exists() || task.data().unit!==material.unit || task.data().subject!==material.subject)) throw new Error('回・教科の一致する既存タスクを選んでください。');
    if(!taskId && task.exists() && task.data().planning?.material?.materialId!==material.materialId) throw new Error('同じIDの別タスクがあります。');
    if(linked.exists() && task.exists() && JSON.stringify(task.data().planning?.material)===JSON.stringify(materialInfo(material)))return id;
    if(task.exists()) {
      const old=task.data().planning??emptyPlan();
      if(old.material && old.material.materialId!==material.materialId) throw new Error('別教材が紐付いています。上書きできません。');
      tx.update(ref,{planning:{...old,revision:old.revision+1,material:materialInfo(material)}});
    } else tx.set(ref,newMaterialTask(material));
    tx.set(binding,{taskId:id,materialId:material.materialId});
    fileRefs.forEach(r=>tx.set(r,{materialId:material.materialId}));
    return id;
  });
}
