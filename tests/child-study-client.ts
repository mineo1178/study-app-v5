export async function seedChildPlans(){
 const {seedDisplay}=await import('./gantt-display-client');await seedDisplay();
 const {auth}=await import('./timer-client');if(auth.app.options.projectId!=='demo-study-hotfix')throw Error('Emulator only');
 const {getFirestore,doc,getDoc,writeBatch}=await import('firebase/firestore'),db=getFirestore(auth.app),root='families/hotfix-study-family',legacy=doc(db,root,'tasks','legacy'),base=(await getDoc(legacy)).data()!,{emptyPlan}=await import('../src/planning/model'),batch=writeBatch(db);
 const range={id:'legacy-scope',label:'復習1〜3',units:3,minutes:5,day:'2026-11-12',done:false,graded:false,corrected:false,actualDay:null,actualSeconds:null};
 batch.update(legacy,{planning:{...emptyPlan(),ranges:[range]}});
 batch.set(doc(db,root,'tasks','early-done'),{...base,id:'early-done',title:'早めに終えた課題',materialName:'先取り教材',status:'in_progress',planning:{...emptyPlan(),ranges:[{...range,id:'early-scope',label:'1〜5問',day:'2026-11-13',done:true,graded:true,corrected:true,actualDay:'2026-11-12'}]},history:[]});
 for(const [id,grade] of [['candidate-s','S'],['candidate-a','A']])batch.set(doc(db,root,'tasks',id),{...base,id,title:'確認テスト'+grade,category:'プリント',materialName:'プリント - 確認テスト'+grade,status:'not_started',history:[]});
 await batch.commit();
}
