import { useState } from 'react';
export type DeletedTask = { id: string; label: string; operationId: string };
export function DeletedTasks({ tasks, onRestore }: { tasks: DeletedTask[]; onRestore: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <details className="task-safety"><summary>削除した課題を復元（{tasks.length}件）</summary><p>このアカウントで削除した課題を、元のtaskId・履歴・進捗のまま戻します。削除時のバックアップと監査記録は保持します。</p>{tasks.map(t => <div key={t.id}><span>{t.label}</span><button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onRestore(t.id); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>復元</button></div>)}{busy && <p role="status">復元中…</p>}{error && <p role="alert">{error}</p>}</details>;
}
