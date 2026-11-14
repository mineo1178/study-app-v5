import {doc,getDoc,getDocs,getFirestore,collection} from 'firebase/firestore';
import {auth} from './timer-client';
import {seedDashboard} from './dashboard-client';
const root='families/hotfix-study-family';
export async function seedLayers(){
 if(location.hostname!=='127.0.0.1'||auth.app.options.projectId!=='demo-study-hotfix'||!auth.currentUser)throw Error('Emulator only');
 await seedDashboard(true);
}
export async function snapshotLayers(){const db=getFirestore(auth.app);return{tasks:(await getDocs(collection(db,root,'tasks'))).docs.map(d=>({id:d.id,...d.data()})),pointer:(await getDoc(doc(db,root,'learningSchedules',auth.currentUser!.uid))).data()};}
