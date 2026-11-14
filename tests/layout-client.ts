import {doc,getFirestore,setDoc} from 'firebase/firestore';
import {auth} from './timer-client';
import {commitCalculationAttempt} from '../src/daily-calculation';
export async function seedLayoutCalculation(){
 if(location.hostname!=='127.0.0.1'||auth.app.options.projectId!=='demo-study-hotfix'||!auth.currentUser)throw Error('Emulator only');
 const db=getFirestore(auth.app),taskId='layout-calculation';await setDoc(doc(db,'families','hotfix-study-family','tasks',taskId),{id:taskId,unit:'第12回',subject:'math',category:'計算',materialName:'計算 - ①',title:'①',status:'in_progress',isRunning:false,currentDuration:0,sessionStartTime:null,lastUpdatedAt:Date.now(),currentMemo:'',history:[],createdAt:new Date().toISOString()});
 for(const day of ['2026-11-13','2026-11-14']){const startedAt=Date.parse(day+'T10:00:00+09:00');await commitCalculationAttempt(db,'hotfix-study-family',auth.currentUser.uid,{id:'layout-first-'+day,dateKey:day,taskId,taskLabel:'第12回 / 計算①',score:day.endsWith('13')?5:7,elapsedSeconds:120,startedAt,finishedAt:startedAt+120000});}
}
