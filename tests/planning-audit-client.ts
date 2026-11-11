import { doc, getFirestore, writeBatch } from "firebase/firestore";
import { auth } from "./timer-client";
import { createInitialGameState } from "../src/game/config";
import { normalizeGachaState } from "../src/game/gacha/logic";
if(location.hostname!=="127.0.0.1" || auth.app.options.projectId!=="demo-study-hotfix")throw new Error("Local audit emulator required");
export async function seedAudit() {
 const db=getFirestore(auth.app),root='families/hotfix-study-family',batch=writeBatch(db),at=Date.now();
 for(const [id,unit,subject,title,status]of [['normal','第11回','math','監査課題','not_started'],['legacy','第11回','math','過去の完了課題','completed'],['next','第12回','japanese','次の回の課題','not_started']] as const){batch.set(doc(db,root,'tasks',id),{id,unit,subject,title,status,category:'教材',materialName:id==='normal'?'監査用の長い教材名・問題番号とページ範囲を含む学習プリント':'監査教材',currentDuration:0,sessionStartTime:null,isRunning:false,lastUpdatedAt:at,currentMemo:'',history:id==='legacy'?[{id:'legacy-history',date:'11/1',duration:60,memo:'old record'}]:[],createdAt:new Date(at).toISOString()});}
 batch.set(doc(db,root,'game','idol-produce'),createInitialGameState());batch.set(doc(db,root,'game','idol-produce','gacha','state'),normalizeGachaState());await batch.commit();
}
