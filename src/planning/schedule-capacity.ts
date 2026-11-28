import {addDays} from './model';

export const REPLAN_DAYS=7;

export function replanCapacities(today:string,adopted:Record<string,number>,confirmed:Record<string,number>,dayCount=REPLAN_DAYS){
 const weekdayMinutes=[20,10,25,10,40,15,30];
 return Object.fromEntries(Array.from({length:dayCount},(_,offset)=>{
  const day=addDays(today,offset);
  return [day,confirmed[day]??adopted[day]??weekdayMinutes[new Date(day).getUTCDay()]];
 }));
}
