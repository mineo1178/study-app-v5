import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StudyGantt} from '../src/components/StudyGantt';
import type {PlanningTask} from '../src/planning/model';
import '../src/index.css';
const tasks:PlanningTask[]=[11,12].flatMap(round=>['science','social','math'].flatMap(subject=>['A','B','S'].map(letter=>({id:`print-${round}-${subject}-${letter}`,unit:`第${round}回`,subject,category:'プリント',materialName:'プリント - 確認テスト'+letter,title:'確認テスト'+letter,status:'not_started' as const,isRunning:false,history:[{duration:123,score:50}]}))).concat(['A','S'].map(letter=>({id:`calc-${round}-${letter}`,unit:`第${round}回`,subject:'math',category:'プリント',materialName:'プリント - 計算テスト'+letter,title:'計算テスト'+letter,status:'not_started' as const,isRunning:false,history:[{duration:123,score:50}]}))));
const before=JSON.stringify(tasks),noWrite=()=>{throw Error('Existing task data must not be rewritten');};
export function Harness(){
 const [uid,setUid]=useState('alice'),[mounted,setMounted]=useState(true),[opened,setOpened]=useState('');
 return <main><button onClick={()=>setUid(uid==='alice'?'bob':'alice')}>利用者を切替</button><output aria-label="利用者">{uid}</output><button onClick={()=>setMounted(!mounted)}>画面切替</button><output aria-label="学習対象">{opened}</output>{mounted&&<StudyGantt key={uid} tasks={tasks} db={null} familyId="binding-fixture" uid={uid} sample active={()=>true} onLocal={noWrite} onOpen={setOpened} onCreated={noWrite} onActual={noWrite} onTaskList={()=>{}}/>}<output aria-label="既存データ維持">{String(JSON.stringify(tasks)===before)}</output></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
