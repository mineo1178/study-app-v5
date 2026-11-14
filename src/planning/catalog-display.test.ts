import {describe,it,expect} from 'vitest';
import {CATALOG_DISPLAY,catalogMaterialDisplay,catalogCandidateInfo,registeredNameParts} from './catalog-display';
import {ganttRows} from './gantt-grid';
import {emptyPlan,type PlanningTask} from './model';
import {taskDisplayName} from './material-display';
const task=(title='確認テストA'):PlanningTask=>({id:'fixture',unit:'第12回',subject:'science',category:'プリント',materialName:'プリント - '+title,title,status:'not_started',isRunning:false,history:[]});
describe('catalog-derived display facts',()=>{
 it('exports only public metadata and excludes private fields and unknown names',()=>{
  expect(CATALOG_DISPLAY.length).toBeGreaterThan(22);
  const raw=JSON.stringify(CATALOG_DISPLAY);
  for(const privateValue of ['C:/','C:\\','taskId','relativePath','candidateTaskIds','fileId','studentName'])expect(raw).not.toContain(privateValue);
  expect(new Set(CATALOG_DISPLAY.map(m=>m.materialId)).size).toBe(CATALOG_DISPLAY.length);
 });
 it('uses catalog facts for confirmed hashes across independent material types',()=>{
  for(const name of ['確認テスト','計算テスト','漢字テスト','言語知識テスト','基礎力強化プリント','理科まとめプリント','レベルアッププリント']){
   const m=CATALOG_DISPLAY.find(m=>m.name===name)!;expect(m).toBeDefined();
   const t={...task(),unit:m.round?`第${m.round}回`:'第12回',subject:m.subject??'science',planning:{...emptyPlan(),material:{materialId:m.materialId,title:m.name,selected:true,requirement:'required' as const,references:[]}}};
   expect(catalogMaterialDisplay(t)?.label).toContain(name);
   expect(taskDisplayName(t)).toBe(catalogMaterialDisplay(t)?.label);
   if(name==='レベルアッププリント'){expect(taskDisplayName(t)).toContain('SSクラス対象');expect(taskDisplayName(t)).not.toContain('STANDARD');}
  }
 });
 it('keeps all A/B/S legacy bindings unconfirmed while showing explicitly marked candidate facts',()=>{
  for(const letter of ['A','B','S']){
   const t=task('確認テスト'+letter),before=structuredClone(t);
   expect(catalogMaterialDisplay(t)).toBeNull();expect(catalogCandidateInfo(t)).toEqual({label:'候補資料：確認テスト（火山と地震）／対応未確認',count:3});
   expect(taskDisplayName(t)).toContain('種類未確認');expect(t).toEqual(before);
  }
 });
 it('does not reinterpret book sections or change task ordering',()=>{
  const t={...task('トレーニング'),category:'練成問題',materialName:'練成問題 - トレーニング'};
  expect(registeredNameParts(t)).toEqual({material:'練成問題',assignment:'トレーニング'});
  expect(taskDisplayName(t)).toBe(t.materialName);expect(catalogCandidateInfo(t)).toBeNull();expect(catalogMaterialDisplay(t)).toBeNull();
  const inputs=['S','A','B'].map(x=>({...task('確認テスト'+x),id:x}));const before=JSON.stringify(inputs);
  expect(ganttRows(inputs,null).filter(r=>r.kind==='task').map(r=>r.task?.id)).toEqual(['A','B','S']);expect(JSON.stringify(inputs)).toBe(before);
 });
 it('rejects conflicting scope/category and never supplements an unknown topic',()=>{
  const m=CATALOG_DISPLAY.find(m=>m.name==='確認テスト'&&m.round===12&&m.subject==='science')!;
  const t={...task(),planning:{...emptyPlan(),material:{materialId:m.materialId,title:m.name,selected:true,requirement:'required' as const,references:[]}}};
  expect(catalogMaterialDisplay({...t,unit:'第11回'})).toBeNull();expect(catalogMaterialDisplay({...t,subject:'math'})).toBeNull();expect(catalogMaterialDisplay({...t,category:'練成問題'})).toBeNull();
  const c=CATALOG_DISPLAY.find(m=>m.name==='計算テスト'&&m.round===12)!;
  expect(c.topic).toBeNull();
 });
});
