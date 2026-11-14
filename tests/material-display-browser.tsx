import {createRoot} from 'react-dom/client';
import {StudyGantt} from '../src/components/StudyGantt';
import {emptyPlan,type PlanningTask} from '../src/planning/model';
import {VERIFIED_PRINT_MATERIALS} from '../src/planning/verified-print-materials';
import '../src/index.css';
const base:PlanningTask={id:'fixture',unit:'第12回',subject:'science',category:'プリント',materialName:'プリント - 確認テストA',title:'確認テストA',status:'not_started',isRunning:false,history:[]};
const confirmed=VERIFIED_PRINT_MATERIALS.filter(m=>m.round===12&&m.subject==='science').map(m=>({...base,id:'confirmed-'+m.difficulty,planning:{...emptyPlan(),material:{materialId:m.materialId,title:m.name,requirement:'advanced' as const,selected:true,references:[]}}}));
const unknown=['A','B','S'].map(letter=>({...base,id:'unknown-'+letter,title:'確認テスト'+letter,materialName:'プリント - 確認テスト'+letter}));
const tasks=[...confirmed,...unknown,{...base,id:'calc',subject:'math',title:'計算テストA',materialName:'プリント - 計算テストA'},{...base,id:'book',unit:'第11回',category:'演習問題集',materialName:'演習問題集 - 基本問題',title:'基本問題'}];
const before=JSON.stringify(tasks);
const noWrite=()=>{throw Error('Display-only fixture must not write task data');};
export function Harness(){return <main><StudyGantt tasks={tasks} db={null} familyId="material-fixture" uid="material-fixture" sample active={()=>true} onLocal={noWrite} onOpen={()=>{}} onCreated={noWrite} onTaskList={()=>{}} onActual={noWrite}/><output aria-label="unchanged tasks">{String(JSON.stringify(tasks)===before)}</output></main>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
