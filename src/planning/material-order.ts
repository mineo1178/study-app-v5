import type {PlanningTask} from './model';
import {printMaterialDisplay} from './material-display';

const normalized=(s:string)=>s.normalize('NFKC').replace(/[\s・･]/g,'').replace(/錬成/g,'練成');
const natural=(a:string,b:string)=>a.localeCompare(b,'ja',{numeric:true,sensitivity:'base'});
function knownKind(name:string):number|null{
 const n=normalized(name);
 if(/^予習シリーズ/.test(n))return 0;if(/^演習問題集/.test(n))return 1;if(/^練成問題/.test(n))return 2;
 if(/^確認テスト/.test(n))return 6;if(/^プリント/.test(n))return 7;
 if(/^計算(?:$|[-－／/])/.test(n))return 3;if(/^(漢字とことば|漢字ことば|漢字|ことば)(?:$|[-－／/])/.test(n))return 4;
 if(/問題集$/.test(n))return 5;return null;
}
export function materialKind(task:PlanningTask){
 const metadata=task.planning?.material?.title,category=knownKind(task.category),name=knownKind(task.materialName);
 let rank=(metadata?knownKind(metadata):null)??category??name??8;
 if(rank===7&&/確認テスト/.test(task.title+' '+task.materialName+' '+(metadata??'')))rank=6;
 return rank;
}
function sectionRank(task:PlanningTask){
 const title=normalized(task.title);
 // B/S/A on a legacy task is not evidence of its PDF's difficulty.
 const display=printMaterialDisplay(task);
 if(display?.confirmed)return ['BASIC','STANDARD','ADVANCE'].indexOf(display.difficulty!);
 const sections=['要点','要点チェック','類題','基本問題','練習問題','トレーニング','応用問題','実戦演習','発展問題','まとめ','まとめてみよう'];
 const index=sections.indexOf(title);return index<0?100:index;
}
function family(task:PlanningTask){
 const display=printMaterialDisplay(task);if(display)return display.group;
 const name=normalized(task.materialName||task.category),title=normalized(task.title);
 return title&&name.endsWith('-'+title)?name.slice(0,-title.length-1):title&&name.endsWith('/'+title)?name.slice(0,-title.length-1):name;
}
export function compareStudyTasks(a:PlanningTask,b:PlanningTask){
 const verifiedOrder=printMaterialDisplay(a)?.confirmed&&printMaterialDisplay(b)?.confirmed?sectionRank(a)-sectionRank(b):0;
 return materialKind(a)-materialKind(b)||natural(family(a),family(b))||verifiedOrder||(a.planning?.order??0)-(b.planning?.order??0)||sectionRank(a)-sectionRank(b)||natural(normalized(a.title),normalized(b.title))||natural(normalized(a.materialName),normalized(b.materialName))||a.id.localeCompare(b.id);
}
