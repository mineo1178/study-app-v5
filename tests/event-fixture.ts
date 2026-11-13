import {DEFAULT_CALENDAR,type EventCalendar} from '../src/planning/events';
export function eventFixture():EventCalendar{
 const at='2026-11-14T12:00:00+09:00',c={...structuredClone(DEFAULT_CALENDAR),calendarId:'browser-events',generatedAt:at};
 c.events.push({...c.events[0],eventId:'lesson-14',kind:'lesson',name:'算数・国語 第14回①',label:'授業',day:'2026-11-27',rounds:['第14回'],nextLessonFor:['第13回'],updatedAt:at});
 c.events.push({...c.events[0],eventId:'same-day-extra',kind:'special',name:'同日開催の長い正式名称の特別授業・全件確認と省略表示の検証',label:'特別授業（長いラベルの省略確認）',rounds:['第11回','第12回'],updatedAt:at});
 return c;
}
