import {createRoot} from 'react-dom/client';
import {StudyGantt} from '../src/components/StudyGantt';
import {emptyPlan,type PlanningTask} from '../src/planning/model';
import {VERIFIED_PRINT_MATERIALS} from '../src/planning/verified-print-materials';
import {CATALOG_DISPLAY} from '../src/planning/catalog-display';
import '../src/index.css';
const base:PlanningTask={id:'fixture',unit:'第12回',subject:'science',category:'プリント',materialName:'プリント - 確認テストA',title:'確認テストA',status:'not_started',isRunning:false,history:[]};
const confirmed=VERIFIED_PRINT_MATERIALS.filter(m=>m.round===12&&m.subject==='science').map(m=>({...base,id:'confirmed-'+m.difficulty,planning:{...emptyPlan(),material:{materialId:m.materialId,title:m.name,requirement:'advanced' as const,selected:true,references:[]}}}));
const unknown=['A','B','S'].map(letter=>({...base,id:'unknown-'+letter,title:'確認テスト'+letter,materialName:'プリント - 確認テスト'+letter}));
const catalog= ['漢字テスト','言語知識テスト','理科まとめプリント','レベルアッププリント'].map(name=>{const m=CATALOG_DISPLAY.find(m=>m.name===name)!;return {...base,id:'catalog-'+name,unit:m.round?`第${m.round}回`:'第12回',subject:m.subject??'science',title:name,materialName:name,planning:{...emptyPlan(),material:{materialId:m.materialId,title:name,requirement:'required' as const,selected:true,references:[]}}};});
const warnings=[['over-one','2026-11-13'],['over-many','2026-11-10'],['today','2026-11-14'],['near','2026-11-17'],['unknown',''],['done','2026-11-10']].map(([id,deadline])=>({...base,id,unit:'第13回',title:'警告確認 '+id,materialName:'警告確認 '+id,status:id==='done'?'completed' as const:'not_started' as const,planning:{...emptyPlan(),deadline}}));
const manual={...base,id:'formal-manual',unit:'第11回',title:'正式期限優先',materialName:'正式期限優先',planning:{...emptyPlan(),wbs:{taskId:'formal-manual',startDay:'',endDay:'2026-11-30',progress:null,updatedBy:'fixture',updatedAt:1}}};
const training={...base,id:'training',category:'練成問題',title:'トレーニング',materialName:'練成問題 - トレーニング'};
const tasks=[...confirmed,...unknown,...catalog,...warnings,manual,training,{...base,id:'unknown-A-overdue',unit:'第11回'},{...base,id:'calc',subject:'math',title:'計算テストA',materialName:'プリント - 計算テストA'},{...base,id:'book',unit:'第11回',category:'演習問題集',materialName:'演習問題集 - 基本問題',title:'基本問題'}];
const before=JSON.stringify(tasks);
const noWrite=()=>{throw Error('Display-only fixture must not write task data');};
export function Harness(){return <main><StudyGantt tasks={tasks} db={null} familyId="material-fixture" uid="material-fixture" sample active={()=>true} onLocal={noWrite} onOpen={()=>{}} onCreated={noWrite} onTaskList={()=>{}} onActual={noWrite}/><output aria-label="unchanged tasks">{String(JSON.stringify(tasks)===before)}</output></main>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
