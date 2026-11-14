import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DeletedTasks} from '../src/components/DeletedTasks';
import '../src/components/PrintBindingList.css';
function Harness(){
 const [deleted,setDeleted]=useState([{id:'original',label:'第12回 / 確認テスト ADVANCE（火山と地震）',operationId:'delete-original'}]),[restored,setRestored]=useState('');
 return <main><DeletedTasks tasks={deleted} onRestore={async id=>{if(id!=='original')throw Error('ID mismatch');setRestored(id);setDeleted([]);}}/><output aria-label="復元taskId">{restored}</output></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
