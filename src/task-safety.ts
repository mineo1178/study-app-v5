import { collection, deleteField, doc, runTransaction, serverTimestamp, type DocumentData, type Firestore } from 'firebase/firestore';
import { taskWriteVersion } from './task-write';

export const isDeletedTask = (task: { _deletion?: unknown }) => !!task._deletion;
export const MAX_DELETE_TASKS = 100;
export const sameTaskValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aa = Object.keys(a).sort(), bb = Object.keys(b).sort();
  return aa.length === bb.length && aa.every((k, i) => k === bb[i] && sameTaskValue((a as DocumentData)[k], (b as DocumentData)[k]));
};
export function assertDeleteSelection(ids: string[], confirmedCount: number) {
  if (!ids.length || ids.length > MAX_DELETE_TASKS || new Set(ids).size !== ids.length || confirmedCount !== ids.length)
    throw Error('削除対象件数を確認してください（最大100件）。');
}
type Scope = { db: Firestore; family: string; uid: string; active: () => boolean };
// One immutable account-owned document contains the exact originals and deletion audit.
// Tasks are only hidden, so history references and material/plan identities survive.
export async function archiveTasks(scope: Scope, ids: string[], confirmedCount: number, operationId = crypto.randomUUID(), expected?: Map<string, DocumentData>) {
  assertDeleteSelection(ids, confirmedCount);
  const { db, family, uid, active } = scope;
  const archive = doc(db, 'families', family, 'taskArchives', uid, 'entries', operationId);
  return runTransaction(db, async tx => {
    if (!active()) throw Error('利用者が切り替わりました。');
    const previous = await tx.get(archive);
    if (previous.exists()) {
      if (!sameTaskValue(previous.data().taskIds, ids)) throw Error('削除操作が競合しました。');
      return operationId;
    }
    const refs = ids.map(id => doc(db, 'families', family, 'tasks', id));
    const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
    if (!active()) throw Error('利用者が切り替わりました。');
    const originals: DocumentData = {};
    snapshots.forEach((snapshot, i) => {
      const data = snapshot.data();
      if (!data || isDeletedTask(data)) throw Error('課題の削除状態が変わりました。再読込してください。');
      if (data.isRunning || data.currentDuration > 0) throw Error('タイマーを停止・保存してから削除してください。');
      if (expected && (!expected.has(ids[i]) || !sameTaskValue(data, expected.get(ids[i])))) throw Error('別の端末で課題が更新されました。削除対象を確認し直してください。');
      originals[ids[i]] = data;
    });
    if (new TextEncoder().encode(JSON.stringify(originals)).length > 700000) throw Error('バックアップが大きいため、対象を分けてください。削除は行っていません。');
    tx.set(archive, { schemaVersion: 1, operation: 'delete', operationId, actor: uid, at: serverTimestamp(), count: ids.length, taskIds: ids, originals });
    refs.forEach(ref => tx.update(ref, { _deletion: { uid, operationId } }));
    return operationId;
  });
}
export async function restoreTask(scope: Scope, id: string, operationId = crypto.randomUUID()) {
  const { db, family, uid, active } = scope;
  return runTransaction(db, async tx => {
    const ref = doc(db, 'families', family, 'tasks', id), audit = doc(collection(db, 'families', family, 'taskArchives', uid, 'restores'), operationId);
    const [snapshot, receipt] = await Promise.all([tx.get(ref), tx.get(audit)]);
    if (!active()) throw Error('利用者が切り替わりました。');
    if (receipt.exists()) { if (receipt.data().taskId !== id) throw Error('復元操作が競合しました。'); return; }
    const data = snapshot.data(), deletion = data?._deletion;
    if (!deletion || deletion.uid !== uid) throw Error('このアカウントで削除した課題を選択してください。');
    const backup = await tx.get(doc(db, 'families', family, 'taskArchives', uid, 'entries', deletion.operationId));
    const original = { ...data }; delete original._deletion;
    if (!backup.exists() || !sameTaskValue(original, backup.data().originals[id])) throw Error('バックアップとの相違があります。復元を停止しました。');
    if (!active()) throw Error('利用者が切り替わりました。');
    tx.set(audit, { taskId: id, archiveId: deletion.operationId, actor: uid, at: serverTimestamp(), operation: 'restore' });
    tx.update(ref, { _deletion: deleteField(), _restoration: { uid, operationId } });
  });
}
export type TaskUpdateBase = Record<string, { exists: boolean; value: unknown }>;
export function taskUpdateBase(data: DocumentData, updates: DocumentData): TaskUpdateBase {
  return Object.fromEntries(Object.keys(updates).map(k => [k, { exists: k in data, value: data[k] ?? null }]));
}
export async function updateTaskSafely(db: Firestore, family: string, id: string, updates: DocumentData, base: TaskUpdateBase, active: () => boolean) {
  if (!base || !sameTaskValue(Object.keys(base).sort(), Object.keys(updates).sort()) || '_deletion' in updates) throw Error('古い未同期データは自動上書きしません。最新の課題を確認してください。');
  return runTransaction(db, async tx => {
    const ref = doc(db, 'families', family, 'tasks', id), snapshot = await tx.get(ref), data = snapshot.data();
    if (!active()) throw Error('利用者が切り替わりました。');
    if (!data || isDeletedTask(data)) throw Error('課題が削除されています。');
    const current = taskUpdateBase(data, updates);
    if (!sameTaskValue(current, base) && !Object.entries(updates).every(([k, v]) => sameTaskValue(data[k], v))) throw Error('別の端末で課題が更新されました。自動上書きを停止しました。');
    tx.update(ref, { ...updates, _writeVersion: taskWriteVersion(data) });
  });
}
export async function createTasksSafely(db: Firestore, family: string, tasks: { id: string }[], active: () => boolean) {
  return runTransaction(db, async tx => {
    const refs = tasks.map(t => doc(db, 'families', family, 'tasks', t.id));
    const existing = await Promise.all(refs.map(ref => tx.get(ref)));
    if (!active()) throw Error('利用者が切り替わりました。');
    if (existing.some(s => s.exists())) throw Error('同じtaskIdが存在するため、追加を停止しました。');
    refs.forEach((ref, i) => tx.set(ref, tasks[i]));
  });
}
