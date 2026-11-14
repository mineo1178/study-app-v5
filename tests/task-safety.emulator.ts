import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getFirestore, increment, serverTimestamp, setDoc, terminate, updateDoc, writeBatch } from 'firebase/firestore';
import { seedFamily } from './emulator-admin';
import { archiveTasks, createTasksSafely, restoreTask, taskUpdateBase, updateTaskSafely } from '../src/task-safety';
import { commitStudySessionOperation } from '../src/study-session';
import { collection } from 'firebase/firestore';
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw Error('Local emulator required');
const clients = ['alice', 'alice', 'bob', 'outsider'].map((uid, i) => {
  const app = initializeApp({ projectId: 'demo-study-v182', apiKey: 'emulator-only' }, 'safety-' + i), db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', Number(endpoint.split(':')[1]), { mockUserToken: { sub: uid } });
  return { app, db };
});
const [one, two, bob, outsider] = clients, family = 'safety-' + Date.now();
const scope = { db: one.db, family, uid: 'alice', active: () => true };
const ref = (id: string, db = one.db) => doc(db, 'families', family, 'tasks', id);
const read = async (id: string, db = one.db) => (await getDocFromServer(ref(id, db))).data()!;
const task = { unit: '第12回', subject: 'science', category: 'プリント', title: '確認テストA', materialName: 'プリント - 確認テストA', status: 'not_started', history: [{ id: 'history', duration: 321, score: 100 }], planning: { revision: 3, fixedTarget: '2026-11-19' }, currentDuration: 0, isRunning: false };
describe('account-scoped atomic backups, audited soft deletion and safe sync', () => {
  beforeAll(async () => {
    await seedFamily(family, ['alice', 'bob']);
    await setDoc(doc(one.db, 'families', family, 'rewardLedger', 'protected'), { sessionId: 'history', totalPoints: 20 });
    await setDoc(doc(one.db, 'families', family, 'game', 'idol-produce'), { fans: 123, points: 456 });
  });
  afterAll(async () => { await Promise.all(clients.map(async c => { await terminate(c.db); await deleteApp(c.app); })); });
  it('backs up the exact document and audit in the same commit, restores on another device, and is idempotent', async () => {
    await setDoc(ref('one'), task);
    await archiveTasks(scope, ['one'], 1, 'delete-one');
    const archived = (await getDocFromServer(doc(one.db, 'families', family, 'taskArchives', 'alice', 'entries', 'delete-one'))).data()!;
    expect(archived.originals.one).toEqual(task); expect(archived.count).toBe(1); expect(archived.actor).toBe('alice'); expect(archived.at.toMillis()).toBeGreaterThan(0);
    expect(await read('one')).toEqual({ ...task, _deletion: { uid: 'alice', operationId: 'delete-one' } });
    await archiveTasks(scope, ['one'], 1, 'delete-one');
    await expect(updateDoc(ref('one'), { status: 'completed' })).rejects.toMatchObject({ code: 'permission-denied' });
    await restoreTask({ ...scope, db: two.db }, 'one', 'restore-one');
    const restored = await read('one'); expect(restored._deletion).toBeUndefined(); expect(restored).toEqual({ ...task, _restoration: { uid: 'alice', operationId: 'restore-one' } });
    await restoreTask(scope, 'one', 'restore-one');
    expect((await getDocFromServer(doc(one.db, 'families', family, 'rewardLedger', 'protected'))).data()).toEqual({ sessionId: 'history', totalPoints: 20 });
    expect((await getDocFromServer(doc(one.db, 'families', family, 'game', 'idol-produce'))).data()).toEqual({ fans: 123, points: 456 });
    const audit = (await getDocFromServer(doc(one.db, 'families', family, 'taskArchives', 'alice', 'restores', 'restore-one'))).data()!;
    expect(audit.archiveId).toBe('delete-one'); expect(audit.taskId).toBe('one');
    await updateDoc(ref('one'), { status: 'in_progress', _writeVersion: increment(1) });
  });
  it('denies physical deletes, missing/forged backup, archive mutation, and unaudited resurrection', async () => {
    await setDoc(ref('guard'), task);
    await expect(deleteDoc(ref('guard'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(ref('guard'), { _deletion: { uid: 'alice', operationId: 'missing' } })).rejects.toMatchObject({ code: 'permission-denied' });
    const batch = writeBatch(one.db), backup = doc(one.db, 'families', family, 'taskArchives', 'alice', 'entries', 'forged');
    batch.set(backup, { schemaVersion: 1, operation: 'delete', operationId: 'forged', actor: 'alice', at: serverTimestamp(), count: 1, taskIds: ['guard'], originals: { guard: { ...task, history: [] } } });
    batch.update(ref('guard'), { _deletion: { uid: 'alice', operationId: 'forged' } });
    await expect(batch.commit()).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await getDocFromServer(backup)).exists()).toBe(false); expect(await read('guard')).toEqual(task);
    await archiveTasks(scope, ['guard'], 1, 'guard');
    await expect(setDoc(ref('guard'), task)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(deleteDoc(doc(one.db, 'families', family, 'taskArchives', 'alice', 'entries', 'guard'))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('requires explicit exact bulk count, aborts all on a missing/running/conflicting target, supports a whole round atomically', async () => {
    await createTasksSafely(one.db, family, Array.from({ length: 46 }, (_, i) => ({ ...task, id: 'bulk-' + i })), () => true);
    await expect(archiveTasks(scope, ['bulk-0', 'bulk-1'], 1)).rejects.toThrow(/件数/);
    await expect(archiveTasks(scope, ['bulk-0', 'missing'], 2)).rejects.toThrow(/状態/); expect((await read('bulk-0'))._deletion).toBeUndefined();
    await updateDoc(ref('bulk-1'), { isRunning: true, _writeVersion: increment(1) });
    await expect(archiveTasks(scope, ['bulk-0', 'bulk-1'], 2)).rejects.toThrow(/タイマー/); expect((await read('bulk-0'))._deletion).toBeUndefined();
    await updateDoc(ref('bulk-1'), { isRunning: false, _writeVersion: increment(1) });
    await expect(archiveTasks(scope, ['bulk-0'], 1, 'stale-delete', new Map([['bulk-0', { ...task, id: 'bulk-0', status: 'completed' }]]))).rejects.toThrow(/更新/);
    const ids = Array.from({ length: 46 }, (_, i) => 'bulk-' + i);
    await archiveTasks(scope, ids, 46, 'whole-round');
    expect((await read('bulk-45'))._deletion.operationId).toBe('whole-round');
  });
  it('rejects stale cached changes and duplicate-ID creation while preserving unrelated fields', async () => {
    await setDoc(ref('sync'), task);
    const oldBase = taskUpdateBase(task, { status: 'completed' });
    await updateDoc(ref('sync'), { status: 'in_progress', _writeVersion: increment(1) });
    await expect(updateTaskSafely(one.db, family, 'sync', { status: 'completed' }, oldBase, () => true)).rejects.toThrow(/上書き/);
    await updateTaskSafely(one.db, family, 'sync', { targetSeconds: 300 }, taskUpdateBase(task, { targetSeconds: 300 }), () => true);
    expect(await read('sync')).toEqual({ ...task, status: 'in_progress', targetSeconds: 300, _writeVersion: 2 });
    await expect(updateTaskSafely(one.db, family, 'sync', { status: 'completed' }, undefined!, () => true)).rejects.toThrow(/古い/);
    await expect(createTasksSafely(one.db, family, [{ ...task, id: 'sync' }, { ...task, id: 'never-created' }], () => true)).rejects.toThrow(/taskId/);
    expect((await getDocFromServer(ref('never-created'))).exists()).toBe(false);
    await expect(setDoc(ref('sync'), { ...task, history: [] })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('isolates accounts and does not let archived tasks start timers or replay history', async () => {
    await expect(getDocFromServer(doc(bob.db, 'families', family, 'taskArchives', 'alice', 'entries', 'guard'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(restoreTask({ ...scope, uid: 'bob', db: bob.db }, 'guard')).rejects.toThrow(/アカウント/);
    await expect(archiveTasks({ ...scope, uid: 'alice', db: outsider.db }, ['sync'], 1)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(archiveTasks({ ...scope, active: () => false }, ['sync'], 1)).rejects.toThrow(/利用者/);
    const result = await commitStudySessionOperation(one.db, collection(one.db, 'families', family, 'tasks'), { taskId: 'guard', operationId: 'timer', sessionId: 'old', kind: 'start', at: Date.now() });
    expect(result.status).toBe('missing'); expect((await read('guard')).history).toEqual(task.history);
  });
});
