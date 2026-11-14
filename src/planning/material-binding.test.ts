import {describe,it,expect} from 'vitest';
import {bindingCandidates,bindingDiff,bindingMaterial,currentBinding,materialTaskIdentity,nextBinding,projectBinding,readBinding} from './material-binding';
import {taskDisplayName} from './material-display';
import {ganttRows} from './gantt-grid';
import {materialKey} from './schedule';
import type {PlanningTask} from './model';
const task:PlanningTask={id:'fixture',unit:'第12回',subject:'science',category:'プリント',materialName:'プリント - 確認テストA',title:'確認テストA',status:'in_progress',isRunning:false,history:[{duration:123,score:50}]};
describe('account-specific user-confirmed material display',()=>{
 it('offers all three candidates without inferring A/B/S',()=>{
  const ids=bindingCandidates(task).map(m=>m.materialId);expect(ids).toHaveLength(3);
  for(const x of ['B','S'])expect(bindingCandidates({...task,title:'確認テスト'+x}).map(m=>m.materialId)).toEqual(ids);
  expect(bindingCandidates({...task,title:'計算テストA',subject:'math'}).map(m=>m.difficulty)).toEqual(['STANDARD','ADVANCE']);
  expect(bindingCandidates({...task,category:'練成問題'})).toEqual([]);
 });
 it('displays an explicit selection while preserving task and plan identity and row order',()=>{
  const original=structuredClone(task),id=bindingCandidates(task).find(m=>m.difficulty==='ADVANCE')!.materialId;
  const b=nextBinding(task,'alice',null,0,id),shown=projectBinding(task,b);
  expect(taskDisplayName(shown)).toBe('確認テスト ADVANCE（火山と地震）');
  expect(materialKey(shown)).toBe(materialKey(task));expect(materialTaskIdentity(shown)).toBe(materialTaskIdentity(task));expect(task).toEqual(original);
  const others=['B','S'].map(s=>({...task,id:s,title:'確認テスト'+s}));
  expect(ganttRows([shown,...others],null).map(r=>r.key)).toEqual(ganttRows([task,...others],null).map(r=>r.key));
  expect(ganttRows([shown,...others],null).find(r=>r.task?.id===task.id)?.label).toContain('ADVANCE');
 });
 it('retains selection on reload, isolates accounts, and supports change and tombstone clear',()=>{
  const [a,b]=bindingCandidates(task),first=nextBinding(task,'alice',null,0,a.materialId);
  const saved=JSON.parse(JSON.stringify({...task,materialDisplayBindings:{alice:first}}));
  expect(bindingMaterial(saved,currentBinding(saved,'alice'))?.materialId).toBe(a.materialId);
  expect(currentBinding(saved,'bob')).toBeNull();
  const second=nextBinding(task,'alice',first,1,b.materialId);expect(second.revision).toBe(2);
  const clear=nextBinding(task,'alice',second,2,null);expect(clear.revision).toBe(3);expect(bindingMaterial(task,clear)).toBeNull();
  expect(nextBinding(task,'alice',clear,3,a.materialId).revision).toBe(4);
 });
 it('rejects stale revisions, unrelated PDFs and corrupt records, invalidates changed task identity',()=>{
  const id=bindingCandidates(task)[0].materialId,b=nextBinding(task,'alice',null,0,id);
  expect(()=>nextBinding(task,'alice',b,0,id)).toThrow(/更新/);
  expect(()=>nextBinding(task,'alice',null,0,'material-'+'0'.repeat(64))).toThrow(/候補/);
  for(const value of [null,{},'bad',{...b,revision:-1},{...b,materialId:'C:/private.pdf'},{...b,confirmedBy:'bob'}])expect(readBinding(value,'alice')).toBeNull();
  for(const t of [{...task,unit:'第11回'},{...task,title:'確認テストB'},{...task,subject:'math'},{...task,id:'other'}])expect(bindingMaterial(t,b)).toBeNull();
 });
 it('exports account-scoped pending differences including revocations and unchanged original registration',()=>{
  const b=nextBinding(task,'alice',null,0,null),diff=bindingDiff(task,b,'project','family');
  expect(diff).toMatchObject({catalogSync:'pending',uid:'alice',changes:[{taskId:'fixture',originalMaterialName:task.materialName,binding:{materialId:null}}]});
  expect(JSON.stringify(diff)).not.toContain('C:/');
 });
});
