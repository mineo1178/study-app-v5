import { describe, expect, it } from 'vitest';
import { assertDeleteSelection, isDeletedTask, sameTaskValue, taskUpdateBase } from './task-safety';
import { retryTaskWrite, taskWriteVersion } from './task-write';
describe('task protection input boundaries', () => {
  it('requires exact explicit bulk count, unique IDs and bounded selection', () => {
    expect(() => assertDeleteSelection(['a', 'b'], 2)).not.toThrow();
    for (const [ids, count] of [[[], 0], [['a', 'a'], 2], [['a'], 2], [Array.from({ length: 101 }, (_, i) => String(i)), 101]] as [string[], number][])
      expect(() => assertDeleteSelection(ids, count)).toThrow();
  });
  it('does not confuse missing values, nested history changes, and array order', () => {
    expect(sameTaskValue({ x: 1, y: [{ a: 2 }] }, { y: [{ a: 2 }], x: 1 })).toBe(true);
    expect(sameTaskValue([1, 2], [2, 1])).toBe(false);
    expect(sameTaskValue({}, { a: null })).toBe(false);
    expect(taskUpdateBase({ status: 'completed' }, { status: 'in_progress', targetSeconds: 300 })).toEqual({ status: { exists: true, value: 'completed' }, targetSeconds: { exists: false, value: null } });
    expect(isDeletedTask({ _deletion: { uid: 'a' } })).toBe(true);
    expect(isDeletedTask({})).toBe(false);
  });
  it('starts legacy versions at one and refuses corrupt versions', () => {
    expect(taskWriteVersion({})).toBe(1); expect(taskWriteVersion({ _writeVersion: 8 })).toBe(9);
    for (const version of [-1, '1', Infinity, 0.5]) expect(() => taskWriteVersion({ _writeVersion: version })).toThrow();
  });
  it('re-reads once on a Rules CAS conflict and never retries network errors blindly', async () => {
    let attempts = 0;
    expect(await retryTaskWrite(async () => { if (++attempts === 1) throw { code: 'permission-denied' }; return 're-read'; })).toBe('re-read');
    expect(attempts).toBe(2); attempts = 0;
    await expect(retryTaskWrite(async () => { attempts++; throw { code: 'unavailable' }; })).rejects.toMatchObject({ code: 'unavailable' });
    expect(attempts).toBe(1);
  });
});
