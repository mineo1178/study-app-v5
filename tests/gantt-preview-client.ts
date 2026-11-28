import {collection,doc,getDocsFromServer,getDocFromServer,getFirestore,setDoc,writeBatch} from 'firebase/firestore';
import {addDays,emptyPlan,type PlanningTask} from '../src/planning/model';
import {accountKey} from '../src/planning/schedule';
import {importSchedule,scheduleCapacityRef,scheduleRoot} from '../src/planning/schedule-repository';
import {scheduleFixture,scheduleTask} from './schedule-fixture';
import {auth} from './timer-client';

const family='hotfix-study-family',today='2026-11-28',tomorrow=addDays(today,1);
const formalId='official-13';
function context(){
 if(auth.app.options.projectId!=='demo-study-hotfix'||!auth.currentUser)throw Error('Signed-in local emulator required');
 const uid=auth.currentUser.uid;
 const db=getFirestore(auth.app);
 return {db,uid,tasks:collection(db,'families',family,'tasks')};
}

function task(round:number,index:number):PlanningTask{
 const completed=index>=(round===13?4:44);
 const id=round===13&&index===0?formalId:`round-${round}-${String(index).padStart(2,'0')}`;
 const subject=index>=30?'math':round===13&&index===0?'science':'japanese';
 return {...scheduleTask,id,unit:`第${round}回`,subject,materialName:'学習教材',title:`第${round}回 課題${index+1}`,
  status:completed?'completed':round===14&&index===0?'in_progress':'not_started',
  history:index===0?[{date:today,duration:600,endAt:Date.parse(today+'T10:00:00+09:00')}]:[],
  ...(round===13&&index===1?{planning:{...emptyPlan(),deadline:addDays(today,-1)}}:{}),
 };
}

function plannedItem(task:PlanningTask,day:string,minutes:number){
 const source=scheduleFixture().items[0];
 return {...source,taskId:task.id,unit:task.unit,subject:task.subject,category:task.category,title:task.title,
  materialId:'legacy-'+task.id,materialName:task.materialName,endDay:day,deadline:null,
  ranges:[{id:'range-'+task.id,label:'問1',units:1,minutes,day}],dailyWork:{[day]:{units:1,minutes}}};
}

export async function seedPreview(){
 const {db,uid,tasks}=context();
 const all=[13,14].flatMap(round=>Array.from({length:49},(_,index)=>task(round,index)));
 for(let start=0;start<all.length;start+=10){
  const batch=writeBatch(db);
  for(const item of all.slice(start,start+10))batch.set(doc(tasks,item.id),item);
  await batch.commit();
 }
 await setDoc(scheduleCapacityRef(db,family,uid),{schemaVersion:1,capacities:Object.fromEntries([0,25,30,20,10,0,0,0,0,0,0,0,0,0].map((n,i)=>[addDays(today,i),n]))});
 const plan=scheduleFixture();
 Object.assign(plan,{accountBinding:await accountKey('demo-study-hotfix',family,uid),
  scope:[{unit:'第13回',subjects:['science','japanese','math'],deadline:null},{unit:'第14回',subjects:['japanese','math'],deadline:null}],
  items:[plannedItem(task(13,0),tomorrow,10)],capacities:{[today]:60,[tomorrow]:50}});
 await importSchedule(db,family,{uid,binding:plan.accountBinding!,active:()=>true},plan);
}

export async function snapshotPreview(){
 const {db,uid,tasks}=context();
 return {tasks:(await getDocsFromServer(tasks)).docs.map(d=>d.data()),
  pointer:(await getDocFromServer(scheduleRoot(db,family,uid))).data()};
}

export async function adoptPreviewTask(id:string,day:string){
 const {db,uid,tasks}=context();
 const root=scheduleRoot(db,family,uid),pointer=await getDocFromServer(root);
 const {plan}=(await getDocFromServer(doc(root,'plans',pointer.data()!.versionId))).data()!;
 const task=(await getDocFromServer(doc(tasks,id))).data() as PlanningTask;
 const next={...plan,revision:plan.revision+1,items:[...plan.items,plannedItem(task,day,15)]};
 await importSchedule(db,family,{uid,binding:plan.accountBinding,active:()=>true},next);
}
