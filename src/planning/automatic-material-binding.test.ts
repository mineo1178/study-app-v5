import {describe,it,expect} from 'vitest';
import {automaticBindingMaterial,bindingCandidates,currentBinding,nextBinding,projectBinding,resolvedBindingMaterial} from './material-binding';
import {taskDisplayName} from './material-display';
import {catalogCandidateInfo} from './catalog-display';
import {ganttRows} from './gantt-grid';
import type {PlanningTask} from './model';
const topics:Record<string,Record<number,string>>={math:{11:'仕事に関する問題',12:'水深の変化と比'},science:{11:'光と音',12:'火山と地震'},social:{11:'江戸時代⑵',12:'江戸時代⑶'}};
const levels={A:'ADVANCE',B:'BASIC',S:'STANDARD'};
const tasks:PlanningTask[]=[11,12].flatMap(round=>Object.keys(topics).flatMap(subject=>['A','B','S'].map(letter=>({id:`${round}-${subject}-${letter}`,unit:`第${round}回`,subject,category:'プリント',title:'確認テスト'+letter,materialName:'プリント - 確認テスト'+letter,status:'not_started' as const,isRunning:false,history:[{duration:123}]}))).concat(['A','S'].map(letter=>({id:`${round}-calculation-${letter}`,unit:`第${round}回`,subject:'math',category:'プリント',title:'計算テスト'+letter,materialName:'プリント - 計算テスト'+letter,status:'not_started' as const,isRunning:false,history:[{duration:123}]}))));
describe('user-approved legacy abbreviations',()=>{
 it.each(tasks)('resolves the verified formal name for $id without writing data',task=>{
  const before=structuredClone(task),round=Number(task.unit.match(/\d+/)![0]),letter=task.title.at(-1) as keyof typeof levels;
  const name=task.title.startsWith('計算')?'計算テスト':'確認テスト',expected=name+' '+levels[letter]+(name==='確認テスト'?'（'+topics[task.subject][round]+'）':'');
  expect(automaticBindingMaterial(task)?.difficulty).toBe(levels[letter]);expect(taskDisplayName(task)).toBe(expected);
  expect(catalogCandidateInfo(task)).toBeNull();expect(task).toEqual(before);
  const reloaded=JSON.parse(JSON.stringify(task));expect(taskDisplayName(projectBinding(reloaded,currentBinding(reloaded,'other-device')))).toBe(expected);
 });
 it('renders all 22 Gantt names consistently, keeps the original task identity and stable order',()=>{
  const before=JSON.stringify(tasks),rows=ganttRows(tasks,null).filter(r=>r.task);
  expect(rows).toHaveLength(22);for(const row of rows)expect(row.label).toBe(taskDisplayName(row.task!));
  expect(rows.map(r=>r.key)).toEqual(ganttRows([...tasks].reverse(),null).filter(r=>r.task).map(r=>r.key));expect(JSON.stringify(tasks)).toBe(before);
 });
 it('prioritizes an existing user selection, isolates accounts, and returns to the rule after clearing',()=>{
  const task=tasks.find(t=>t.id==='12-science-A')!,id=bindingCandidates(task).find(m=>m.difficulty==='BASIC')!.materialId;
  const saved={...task,materialDisplayBindings:{alice:nextBinding(task,'alice',null,0,id)}};
  expect(taskDisplayName(projectBinding(saved,currentBinding(saved,'alice')))).toBe('確認テスト BASIC（火山と地震）');
  expect(taskDisplayName(projectBinding(saved,currentBinding(saved,'bob')))).toBe('確認テスト ADVANCE（火山と地震）');
  const cleared=nextBinding(task,'alice',saved.materialDisplayBindings.alice,1,null);expect(resolvedBindingMaterial(task,cleared)?.difficulty).toBe('ADVANCE');
  const stale={...saved.materialDisplayBindings.alice,taskIdentity:'outdated'};expect(resolvedBindingMaterial(task,stale)).toBeNull();
 });
 it('leaves ambiguous, missing, conflicting and SS-class cases unresolved',()=>{
  const task=tasks.find(t=>t.id==='12-science-A')!,one=automaticBindingMaterial(task)!;
  expect(automaticBindingMaterial(task,[one,{...one,materialId:'material-'+'0'.repeat(64)}])).toBeNull();
  for(const t of [{...task,title:'確認テストSS'},{...task,category:'練成問題'},{...task,unit:'第99回'},{...task,materialName:'プリント - 確認テストB'},{...task,title:'計算テストB',materialName:'プリント - 計算テストB',subject:'math'}])expect(automaticBindingMaterial(t)).toBeNull();
 });
});
