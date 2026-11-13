import type {PlanningTask,TaskPlan} from './model';
export type QuestionWeights={first:number;grading:number;mastery:number;confirmed:boolean;basis?:'provisional_equal'|'confirmed'};
export type QuestionScope={scopeId:string;label:string|null;total:number|null;confirmed:boolean;weights:QuestionWeights};
export type QuestionDay={first:number;grading:number;mastery:number};
export type QuestionPlan=QuestionScope&{targetDay?:string|null;daily:Record<string,QuestionDay>};
export type QuestionMeasurement=QuestionScope&{firstDone:number|null;graded:number|null;redoNeeded:number|null;redoDone:number|null;correctionStatus:'unknown'|'required'|'none';noErrorsConfirmed:boolean;observedAt:number};
export type QuestionGoal={id:string;revision:number;reason:string;adoptedAt:number;plan:QuestionPlan};
const keys=['first','grading','mastery'] as const;
const number=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=100000;
const date=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d).toISOString().slice(0,10)===d;
export const scopeKey=(s:QuestionScope)=>JSON.stringify([s.scopeId,s.label,s.total,...keys.map(k=>s.weights[k])]);
export function validateQuestionScope(s:QuestionScope){
 if(!s||typeof s.scopeId!=='string'||!/^[-a-zA-Z0-9_]{1,160}$/.test(s.scopeId)||(s.label!==null&&(typeof s.label!=='string'||s.label.length>200))||(s.total!==null&&(!number(s.total)||s.total===0))||typeof s.confirmed!=='boolean'||!s.weights||typeof s.weights.confirmed!=='boolean'||keys.some(k=>!number(s.weights[k])||s.weights[k]===0)||s.confirmed&&(!s.label?.trim()||!s.total))throw Error('問題範囲・総問題数・重みの確認が必要です。');
}
export function validateQuestionMeasurement(m:QuestionMeasurement){
 validateQuestionScope(m);if(!Number.isFinite(m.observedAt)||m.observedAt<=0||typeof m.noErrorsConfirmed!=='boolean'||!['unknown','required','none'].includes(m.correctionStatus))throw Error('問題数の確認状態が不正です。');
 for(const n of [m.firstDone,m.graded,m.redoNeeded,m.redoDone])if(n!==null&&(!number(n)||(m.total!==null&&n>m.total)))throw Error('問題数は総数以内の整数にしてください。');
 if(m.graded!==null&&m.firstDone!==null&&m.graded>m.firstDone||m.redoNeeded!==null&&m.graded!==null&&m.redoNeeded>m.graded||m.redoDone!==null&&m.redoNeeded!==null&&m.redoDone>m.redoNeeded)throw Error('演習・採点・直しの問題数の順序を確認してください。');
 if(m.correctionStatus==='none'&&(!m.noErrorsConfirmed||m.redoNeeded!==0||m.redoDone!==0||!m.graded)||m.correctionStatus==='required'&&!(m.redoNeeded!==null&&m.redoNeeded>0)||m.correctionStatus==='unknown'&&((m.redoDone??0)>0||m.noErrorsConfirmed))throw Error('直し不要は採点後に確認してください。未確認は空欄のまま保存できます。');
}
export function validateQuestionPlan(p:QuestionPlan){
 validateQuestionScope(p);if(p.targetDay!==undefined&&p.targetDay!==null&&!date(p.targetDay))throw Error('目標日を確認してください。');if(!p.daily||typeof p.daily!=='object'||Array.isArray(p.daily)||Object.keys(p.daily).length>366)throw Error('日別問題数を確認してください。');
 const sum={first:0,grading:0,mastery:0};for(const [d,q]of Object.entries(p.daily).sort()){if(!date(d)||p.targetDay&&d>p.targetDay||!q||keys.some(k=>!number(q[k])))throw Error('日付・日別問題数を確認してください。');for(const k of keys)sum[k]+=q[k];if(!p.total||keys.some(k=>sum[k]>p.total!)||sum.grading>sum.first||sum.mastery>sum.grading)throw Error('日別数量は演習→採点→直し完了の順で、総問題数以内にしてください。');}
}
export const readyScope=(s:QuestionScope|undefined)=>!!s&&s.confirmed&&s.weights.confirmed&&!!s.total&&!!s.label;
export function questionActual(m:QuestionMeasurement|undefined){
 if(m){try{validateQuestionMeasurement(m);}catch{return null;}}
 if(!m||!readyScope(m)||m.firstDone===null||m.graded===null)return null;
 if(m.graded>0&&(m.redoNeeded===null||m.redoDone===null||m.correctionStatus==='unknown'||m.correctionStatus==='none'&&!m.noErrorsConfirmed))return null;
 const mastered=m.graded===0?0:m.graded-m.redoNeeded!+m.redoDone!,w=m.weights,denominator=m.total!*(w.first+w.grading+w.mastery);return{percent:100*(m.firstDone*w.first+m.graded*w.grading+mastered*w.mastery)/denominator,mastered,remaining:m.total!-mastered,work:denominator,unitKey:JSON.stringify([w.first,w.grading,w.mastery])};
}
export function questionDaily(p:QuestionPlan|undefined){
 if(p){try{validateQuestionPlan(p);}catch{return null;}}if(!p||!readyScope(p))return null;const sums=keys.map(k=>Object.values(p.daily).reduce((n,q)=>n+q[k],0));if(sums.some(n=>n!==p.total))return null;
 const w=p.weights,total=p.total!*(w.first+w.grading+w.mastery);return Object.fromEntries(Object.entries(p.daily).map(([d,q])=>[d,100*(q.first*w.first+q.grading*w.grading+q.mastery*w.mastery)/total]));
}
export function questionComparison(task:PlanningTask,item:{questionPlan?:QuestionPlan;baseline:{targetDay:string|null}},today:string){
 const m=task.planning?.questionMeasurement,p=task.planning?.questionPlan??item.questionPlan,g=task.planning?.questionGoal;
 if(!m&&!p&&!g)return null;const actual=questionActual(m),compatible=(v:QuestionPlan|undefined)=>!!m&&!!v&&scopeKey(m)===scopeKey(v),manualDaily=compatible(p)?questionDaily(p):null,goalDaily=!item.baseline.targetDay&&compatible(g?.plan)?questionDaily(g?.plan):null;
 const expected=(d:Record<string,number>|null)=>d?Object.entries(d).reduce((n,[day,q])=>n+(day<=today?q:0),0):null,planned=expected(manualDaily),fixed=expected(goalDaily);
 return{actual,planned,fixed,referenceDaily:questionDaily(p),manualDaily:manualDaily??{},goalDaily:goalDaily??{},manual:actual&&planned!==null?{expected:planned,points:actual.percent-planned}:null,goal:actual&&fixed!==null?{expected:fixed,points:actual.percent-fixed}:null};
}
export function questionWeight(task:PlanningTask){return questionActual(task.planning?.questionMeasurement);}
export function updateQuestion(task:PlanningTask,change:{measurement?:QuestionMeasurement;plan?:QuestionPlan;goal?:QuestionPlan;reason?:string},now:number):TaskPlan{
 const old=task.planning??{schemaVersion:1 as const,revision:0,endDay:'',deadline:'',ranges:[],baseline:null,baselineHistory:[]},next=structuredClone(old);
 if(change.measurement){validateQuestionMeasurement(change.measurement);if(old.questionMeasurement)next.questionMeasurementHistory=[...old.questionMeasurementHistory??[],structuredClone(old.questionMeasurement)];next.questionMeasurement=change.measurement;}
 if(change.plan){validateQuestionPlan(change.plan);if(!questionDaily(change.plan))throw Error('全問題の演習・採点・直し完了の日別予定を入力してください。');if(old.questionPlan)next.questionPlanHistory=[...old.questionPlanHistory??[],structuredClone(old.questionPlan)];next.questionPlan=change.plan;}
 if(change.goal){validateQuestionPlan(change.goal);if(!questionDaily(change.goal)||!change.reason?.trim())throw Error('固定目標の範囲・日別量・採用理由を確認してください。');if(old.baseline?.targetDay)throw Error('既存固定目標の基準を先に確認してください。');if(old.questionGoal)next.questionGoalHistory=[...old.questionGoalHistory??[],structuredClone(old.questionGoal)];next.questionGoal={id:'quantity-goal-'+now,revision:(old.questionGoal?.revision??0)+1,adoptedAt:now,reason:change.reason.trim(),plan:change.goal};}
 return next;
}
