import {it,expect} from 'vitest';
import {scheduleFixture,scheduleTask} from '../../tests/schedule-fixture';
import {lagIndicators,shortPoints} from './wbs-lag';
import {editWbs} from './wbs';
import {taskCounts,ganttRows} from './gantt-grid';
it('uses compact signs and explicitly identifies unavailable comparison',()=>{expect(shortPoints(-20)).toBe('−20pt');expect(shortPoints(10)).toBe('＋10pt');expect(shortPoints(0)).toBe('予定内');expect(lagIndicators([scheduleTask],null,'2026-11-13').map(r=>r.text)).toEqual(['比較不可']);});
it('does not infer daily progress from two manual date points or complete a manual100 task',()=>{const t={...scheduleTask,planning:editWbs(scheduleTask,{startDay:'2026-11-10',endDay:'2026-11-11',progress:100},'p',123)};expect(lagIndicators([t],null,'2026-11-13').map(r=>r.text)).toEqual(['2日遅れ','比較不可']);expect(taskCounts([t,t])).toEqual({total:1,completed:0,inProgress:0,notStarted:1});});
it('labels manual-only reference separately from actual-based red and purple',()=>{const t={...scheduleTask,planning:editWbs(scheduleTask,{startDay:'',endDay:'',progress:40},'p',123)};const rows=lagIndicators([t],scheduleFixture(),'2026-11-12');expect(rows[0].text).toBe('手動参考差');expect(rows[1].text).toContain('赤 −60pt');expect(rows.every(r=>r.tone==='reference')).toBe(true);});
it('does not repeat an identical material and task name',()=>{const t={...scheduleTask,materialName:'予習シリーズ - 基本問題',title:'基本問題'};expect(ganttRows([t],null).find(r=>r.task)?.label).toBe('予習シリーズ - 基本問題');});
