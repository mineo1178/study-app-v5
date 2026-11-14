import {it,expect} from 'vitest';
import {compareStudyTasks,materialKind} from './material-order';
import {scheduleTask} from '../../tests/schedule-fixture';
import {emptyPlan} from './model';
const task=(id:string,category:string,title:string)=>({...scheduleTask,id,category,title,materialName:category+' - '+title});
it('orders books before prints, absorbs verified aliases and keeps unknowns unknown',()=>{
 const rows=[task('p','プリント','確認テストS'),task('u','その他','謎の資料'),task('k','計算','①'),task('e','演習問題集','基本問題'),task('y','予習シリーズ','練習問題'),task('r','錬成問題集','基本問題'),task('j','漢字とことば','漢字練習'),task('b','市販問題集','演習'),task('pp','プリント','計算テストA')];
 const before=JSON.stringify(rows);expect([...rows].sort(compareStudyTasks).map(t=>t.id)).toEqual(['y','e','r','k','j','b','p','pp','u']);expect(JSON.stringify(rows)).toBe(before);expect(materialKind(rows[1])).toBe(8);
 expect(materialKind({...rows[0],planning:{...emptyPlan(),material:{materialId:'m',title:'予習シリーズ',selected:true,requirement:'required',references:[]}}})).toBe(0);
});
it('uses natural section/numeric order, unconfirmed lexical order, and stable ID tie breaks',()=>{
 const sections=['まとめ','発展問題','応用問題','練習問題','基本問題'].map((title,i)=>task('s'+i,'演習問題集',title));expect([...sections].sort(compareStudyTasks).map(t=>t.title)).toEqual(['基本問題','練習問題','応用問題','発展問題','まとめ']);
 const prints=['確認テストA','確認テストB','確認テストS'].map((t,i)=>task('p'+i,'プリント',t));expect([...prints].sort(compareStudyTasks).map(t=>t.title)).toEqual(['確認テストA','確認テストB','確認テストS']);
 const numeric=[task('n10','計算','10'),task('n2','計算','②'),task('n1','計算','①')];expect([...numeric].sort(compareStudyTasks).map(t=>t.id)).toEqual(['n1','n2','n10']);
 const same=[task('z','その他','資料'),task('a','その他','資料')];expect([...same].reverse().sort(compareStudyTasks).map(t=>t.id)).toEqual([...same].sort(compareStudyTasks).map(t=>t.id));
});
