import {addDays,validDay} from './model';
export type PreparationTask={taskId:string;availableOn:string;firstMinutes:number;correctionMinutes:number;finalMinutes:number;priority:number|null;completed:boolean};
export type PreparationPhase={phase:'first_and_marking'|'correction'|'final_check';day:string;minutes:number;conditional:boolean};
export function preparationWindow(exam:string){if(!validDay(exam)||new Date(exam).getUTCDay()!==6)throw Error('確認済みの土曜日の試験日を指定してください。');return{firstDeadline:addDays(exam,-3),finalDeadline:addDays(exam,-1),initialDays:[-5,-4,-3].map(n=>addDays(exam,n)),correctionDays:[addDays(exam,-2),addDays(exam,-1)]};}
export function allocatePreparation(tasks:PreparationTask[],options:{today:string;exam:string;capacities:Record<string,number>;existing:Record<string,number>;recoveryDays?:string[];priorityOnly?:boolean}){
 const w=preparationWindow(options.exam),used={...options.existing},phases:{taskId:string;phases:PreparationPhase[]}[]=[],held:{taskId:string;reason:string;minutes:number}[]=[],days=Object.keys(options.capacities).sort();
 const remaining=tasks.filter(t=>!t.completed),ordered=options.priorityOnly?[...remaining].sort((a,b)=>(a.priority??Infinity)-(b.priority??Infinity)):remaining;
 for(const task of ordered){const minutes=task.firstMinutes+task.correctionMinutes+task.finalMinutes;if([task.firstMinutes,task.correctionMinutes,task.finalMinutes].some(n=>!Number.isFinite(n)||n<0)||!validDay(task.availableOn))throw Error('工程時間・取組可能日を確認してください。');
  if(options.priorityOnly&&task.priority===null){held.push({taskId:task.taskId,reason:'優先度未確認',minutes});continue;}
  const draft={...used},chosen:PreparationPhase[]=[];
  const candidates=[...new Set([...w.initialDays,...options.recoveryDays??[]])].filter(d=>d>=options.today&&d>=task.availableOn&&d<=w.firstDeadline&&d in options.capacities);
  const stages:[PreparationPhase['phase'],number,string[],boolean][]=[['first_and_marking',task.firstMinutes,candidates,false],['correction',task.correctionMinutes,w.correctionDays,true],['final_check',task.finalMinutes,[w.finalDeadline],false]];
  for(const [phase,amount,pool,conditional]of stages){if(amount===0)continue;const last=chosen.at(-1)?.day;const eligible=pool.filter(d=>d>=options.today&&d>=task.availableOn&&(!last||d>=last)&&(phase!=='correction'||!last||d>last)&&d in options.capacities&&(!options.priorityOnly||(draft[d]??0)+amount<=options.capacities[d])).sort((a,b)=>((draft[a]??0)+amount)/Math.max(1,options.capacities[a])-((draft[b]??0)+amount)/Math.max(1,options.capacities[b])||a.localeCompare(b));if(!eligible.length)break;const day=eligible[0];draft[day]=(draft[day]??0)+amount;chosen.push({phase,day,minutes:amount,conditional});}
  if(chosen.length!==stages.filter(s=>s[1]>0).length){held.push({taskId:task.taskId,reason:task.availableOn>w.firstDeadline?'授業後の取組可能日が水曜期限を超える（例外・要個別確認）':'工程別容量・順序条件に収まらない',minutes});continue;}
  Object.assign(used,draft);phases.push({taskId:task.taskId,phases:chosen});
 }
 const daily=days.map(day=>({day,capacityMinutes:options.capacities[day],existingMinutes:options.existing[day]??0,proposedMinutes:phases.flatMap(t=>t.phases).filter(p=>p.day===day).reduce((n,p)=>n+p.minutes,0),overMinutes:Math.max(0,(used[day]??0)-options.capacities[day])}));
 return{...w,phases,held,daily,requiredMinutes:remaining.reduce((n,t)=>n+t.firstMinutes+t.correctionMinutes+t.finalMinutes,0),scheduledMinutes:phases.flatMap(t=>t.phases).reduce((n,p)=>n+p.minutes,0),capacityMinutes:days.reduce((n,d)=>n+options.capacities[d],0),overMinutes:daily.reduce((n,d)=>n+d.overMinutes,0)};
}
