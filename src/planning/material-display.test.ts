import {describe,it,expect} from 'vitest';
import {emptyPlan,type PlanningTask} from './model';
import {printMaterialDisplay,taskDisplayName,taskDisplayTitle} from './material-display';
import {VERIFIED_PRINT_MATERIALS} from './verified-print-materials';
import {ganttRows} from './gantt-grid';
import {compareStudyTasks} from './material-order';
import {assessProposal} from './proposal-matching';
import {materialKey,scheduleErrors} from './schedule';
import {scheduleFixture,scheduleTask} from '../../tests/schedule-fixture';

const task=(id:string,title='確認テストA'):PlanningTask=>({...scheduleTask,id,unit:'第12回',subject:'science',category:'プリント',materialName:'プリント - '+title,title});
const science=VERIFIED_PRINT_MATERIALS.find(m=>m.round===12&&m.subject==='science'&&m.difficulty==='ADVANCE')!;
const bound=(id:string,materialId=science.materialId)=>({...task(id),planning:{...emptyPlan(),material:{materialId,title:'確認テスト',requirement:'advanced' as const,selected:true,references:[]}}});
describe('evidence-based print display, without changing task identity',()=>{
 it('recognizes the verified science 12 PDF metadata without binding a legacy task',()=>{
  expect(science).toMatchObject({grade:5,term:'lower',name:'確認テスト',topic:'火山と地震',difficulty:'ADVANCE'});
  expect(taskDisplayName(bound('verified'))).toBe('確認テスト ADVANCE（火山と地震）');
  expect(taskDisplayName(task('legacy'))).toBe('確認テスト（種類未確認）／旧登録 A（対応未確認）');
 });
 it.each(['A','B','S'])('does not infer a difficulty from legacy %s',suffix=>{
  const t=task('legacy','確認テスト'+suffix),before=structuredClone(t);
  expect(printMaterialDisplay(t)).toMatchObject({confirmed:false,difficulty:null});
  expect(taskDisplayTitle(t)).toContain('元の登録：'+t.materialName);
  expect(t).toEqual(before);expect(materialKey(t)).toBe('legacy-legacy');
 });
 it('refuses wrong subject, round, category, ID or test family even when a PDF exists',()=>{
  for(const t of [{...bound('x'),subject:'social'},{...bound('x'),unit:'第11回'},{...bound('x'),category:'演習問題集'},bound('x','material-'+'f'.repeat(64)),{...bound('x'),title:'計算テストA'}])expect(printMaterialDisplay(t)?.confirmed).not.toBe(true);
 });
 it('keeps calculation tests independent and invents no unit for them',()=>{
  const calc=VERIFIED_PRINT_MATERIALS.find(m=>m.round===12&&m.name==='計算テスト'&&m.difficulty==='STANDARD')!;
  const t={...bound('calc',calc.materialId),subject:'math',title:'計算テストS',materialName:'プリント - 計算テストS'};
  expect(taskDisplayName(t)).toBe('計算テスト STANDARD');
  expect(taskDisplayName({...t,planning:undefined})).toContain('計算テスト（種類未確認）');
 });
 it('groups verified types and sorts BASIC, STANDARD, ADVANCE using evidence, not shorthand',()=>{
  const docs=VERIFIED_PRINT_MATERIALS.filter(m=>m.round===12&&m.subject==='science');
  const tasks=docs.map((m,i)=>({...bound('verified-'+i,m.materialId),planning:{...bound('x',m.materialId).planning,order:100-i}}));
  const sorted=[...tasks].reverse().sort(compareStudyTasks);
  expect(sorted.map(t=>printMaterialDisplay(t)?.difficulty)).toEqual(['BASIC','STANDARD','ADVANCE']);
  const rows=ganttRows(tasks,null);
  expect(rows.filter(r=>r.kind==='material').map(r=>r.label)).toEqual(['確認テスト']);
  expect(rows.filter(r=>r.kind==='task').map(r=>r.task?.id)).toEqual(sorted.map(t=>t.id));
 });
 it('keeps unknown rows distinct and stable across reload/order permutations',()=>{
  const tasks=['S','A','B'].map(s=>task('unknown-'+s,'確認テスト'+s));
  expect(ganttRows(tasks,null).map(r=>[r.key,r.label])).toEqual(ganttRows([...tasks].reverse(),null).map(r=>[r.key,r.label]));
  expect(ganttRows(tasks,null).filter(r=>r.kind==='task').map(r=>r.label)).toEqual(['旧登録 A（対応未確認）','旧登録 B（対応未確認）','旧登録 S（対応未確認）']);
 });
 it('leaves books and unrelated task names intact',()=>{
  const t={...task('book','基本問題'),category:'演習問題集',materialName:'演習問題集 - 基本問題'};
  expect(printMaterialDisplay(t)).toBeNull();expect(taskDisplayName(t)).toBe(t.materialName);
 });
 it('does not change adopted plan identity, import conflicts, task IDs, history, progress or fixed goals',()=>{
  const t=task('keep'),p=scheduleFixture();p.items=[{...p.items[0],taskId:t.id,unit:t.unit,subject:"science",category:t.category,materialName:t.materialName,materialId:materialKey(t),title:t.title}];
  const before=structuredClone({t,p}),conflicts=scheduleErrors(p,[t]);
  taskDisplayName(t);ganttRows([t],p);[t].sort(compareStudyTasks);
  expect(scheduleErrors(p,[t])).toEqual(conflicts);expect({t,p}).toEqual(before);
 });
 it('does not promote an uncertain legacy/PDF proposal match to A',()=>{
  const proposal={round:12,subject:'science',category:'プリント',title:'確認テスト ADVANCE',materialId:science.materialId,scope:{pdfPages:[1],instructions:'対象未確認',selection:'to_confirm'}};
  const before=assessProposal(proposal as Parameters<typeof assessProposal>[0],[task('legacy')]);
  taskDisplayName(task('legacy'));
  expect(assessProposal(proposal as Parameters<typeof assessProposal>[0],[task('legacy')])).toEqual(before);
  expect(before.rank).toBe('B');
 });
});
