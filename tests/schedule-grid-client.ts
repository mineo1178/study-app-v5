export async function seedGrid(){
 const {seedChildPlans}=await import('./child-study-client');await seedChildPlans();
 const {auth}=await import('./timer-client');if(auth.app.options.projectId!=='demo-study-hotfix')throw Error('Emulator only');
 const {getFirestore,doc,getDoc,updateDoc}=await import('firebase/firestore'),ref=doc(getFirestore(auth.app),'families/hotfix-study-family/tasks/normal'),data=(await getDoc(ref)).data()!,planning=data.planning;
 await updateDoc(ref,{planning:{...planning,ranges:[...planning.ranges,...['2026-11-13','2026-11-14'].map((day,i)=>({...planning.ranges[0],id:'next-'+i,label:'続き'+i,day}))]}});
}
