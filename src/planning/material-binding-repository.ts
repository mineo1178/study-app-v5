import {doc,FieldPath,runTransaction,type Firestore} from 'firebase/firestore';
import {currentBinding,materialTaskIdentity,nextBinding,type MaterialBinding} from './material-binding';
import type {PlanningTask} from './model';

// Only an account's display binding is patched; the task/plan identity is immutable here.
export async function saveMaterialBinding(db:Firestore,familyId:string,uid:string,task:PlanningTask,expectedRevision:number,materialId:string|null,active:()=>boolean):Promise<MaterialBinding>{
 if(!active())throw Error('利用者が切り替わりました。');
 return runTransaction(db,async tx=>{
  const ref=doc(db,'families',familyId,'tasks',task.id),snapshot=await tx.get(ref);
  if(!active())throw Error('利用者が切り替わりました。');
  if(!snapshot.exists())throw Error('課題が削除されています。');
  const live={...snapshot.data(),id:snapshot.id} as PlanningTask;
  if(materialTaskIdentity(live)!==materialTaskIdentity(task))throw Error('課題の登録情報が更新されました。詳細を開き直してください。');
  const next=nextBinding(live,uid,currentBinding(live,uid),expectedRevision,materialId);
  tx.update(ref,new FieldPath('materialDisplayBindings',uid),next);
  return next;
 });
}
