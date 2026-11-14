import {doc,getFirestore,setDoc} from 'firebase/firestore';
import {auth} from './timer-client';
export async function addNavigationTask(){
 if(location.hostname!=='127.0.0.1'||auth.app.options.projectId!=='demo-study-hotfix'||!auth.currentUser)throw Error('Emulator only');
 const task={id:'navigation-round13',unit:'第13回',subject:'math',category:'計算',materialName:'計算 - ①',title:'①',status:'not_started',isRunning:false,currentDuration:0,sessionStartTime:null,lastUpdatedAt:Date.now(),currentMemo:'',history:[],createdAt:new Date().toISOString()};
 await setDoc(doc(getFirestore(auth.app),'families','hotfix-study-family','tasks',task.id),task);
}
