import {getFirestore,doc,getDoc,getDocs,collection,writeBatch} from 'firebase/firestore';
import {auth} from './timer-client';
import {seedAudit} from './planning-audit-client';
import {regenerationFixture} from './regeneration-fixture';
import {regeneratePlan} from '../src/planning/regenerate-plan';
import {accountKey} from '../src/planning/schedule';
import {importSchedule} from '../src/planning/schedule-repository';
import {DEFAULT_CALENDAR} from '../src/planning/events';
const root='families/hotfix-study-family';
function db(){if(location.hostname!=='127.0.0.1'||auth.app.options.projectId!=='demo-study-hotfix'||!auth.currentUser)throw Error('Emulator only');return getFirestore(auth.app);}
export async function seedRegeneration(){
 await seedAudit();const database=db(),uid=auth.currentUser!.uid,f=regenerationFixture(),batch=writeBatch(database);
 for(const t of f.tasks)batch.set(doc(database,root,'tasks',t.id),{...t,currentDuration:0,sessionStartTime:null,lastUpdatedAt:Date.now(),currentMemo:'',createdAt:new Date().toISOString()});await batch.commit();
 f.current.accountBinding=await accountKey(database.app.options.projectId!,'hotfix-study-family',uid);f.current.baseVersion=null;
 await importSchedule(database,'hotfix-study-family',{uid,binding:f.current.accountBinding,active:()=>true},f.current);
 return regeneratePlan({...f,calendar:DEFAULT_CALENDAR,today:'2026-11-14',snapshotAt:new Date().toISOString(),generatedAt:new Date().toISOString(),revision:6}).plan;
}
export async function regenerationState(){const database=db(),uid=auth.currentUser!.uid;return{pointer:(await getDoc(doc(database,root,'learningSchedules',uid))).data(),plans:(await getDocs(collection(database,root,'learningSchedules',uid,'plans'))).docs.map(d=>({id:d.id,...d.data()})),tasks:(await getDocs(collection(database,root,'tasks'))).docs.map(d=>({id:d.id,...d.data()}))};}
