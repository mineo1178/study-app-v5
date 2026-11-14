import { useState, type ComponentProps } from 'react';
import { MaterialBindingEditor } from './MaterialBindingEditor';
import { bindingFamily, bindingMaterial, resolvedBindingMaterial } from '../planning/material-binding';
import { SUBJECTS } from '../review/model';
import { taskDisplayName } from '../planning/material-display';
import type { PlanningTask } from '../planning/model';
import './PrintBindingList.css';

type Props = Omit<ComponentProps<typeof MaterialBindingEditor>, 'task' | 'record'> & { tasks: PlanningTask[]; record: (task: PlanningTask) => ComponentProps<typeof MaterialBindingEditor>['record'] };
export function PrintBindingList({ tasks, record, ...editor }: Props) {
  const [onlyPending, setOnlyPending] = useState(true);
  const prints = tasks.filter(t => bindingFamily(t));
  const pending = prints.filter(t => !resolvedBindingMaterial(t, record(t)));
  return <details className="print-binding-list"><summary>プリントの教材対応を修正（例外{pending.length}／全{prints.length}件）</summary>
    <p>台帳の正式名称を略称ルールで自動表示しています。利用者が保存した対応を優先します。例外や修正がある場合だけ選択・保存してください。</p>
    <label><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />例外だけ表示</label>
    <p>利用者が修正した対応は同じアカウントの別端末でも共有します。ローカル台帳への修正反映には各課題の差分JSONを利用できます。</p>
    <div className="print-binding-cards">{(onlyPending ? pending : prints).map(t => <details key={t.id} data-binding-task={t.id}>
      <summary><span>{t.unit}・{SUBJECTS[t.subject as keyof typeof SUBJECTS] ?? t.subject}</span><strong>{taskDisplayName(t)}</strong><small>{bindingMaterial(t, record(t)) ? '利用者確認済み' : resolvedBindingMaterial(t, record(t)) ? '略称ルールで自動対応' : '対応未確認：詳細で候補を確認してください'}</small></summary>
      <MaterialBindingEditor key={t.id + ':' + (record(t)?.revision ?? 0)} {...editor} task={t} record={record(t)} />
    </details>)}</div>
  </details>;
}
