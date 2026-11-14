import { useState, type ComponentProps } from 'react';
import { MaterialBindingEditor } from './MaterialBindingEditor';
import { bindingFamily, bindingMaterial } from '../planning/material-binding';
import { SUBJECTS } from '../review/model';
import { taskDisplayName } from '../planning/material-display';
import type { PlanningTask } from '../planning/model';
import './PrintBindingList.css';

type Props = Omit<ComponentProps<typeof MaterialBindingEditor>, 'task' | 'record'> & { tasks: PlanningTask[]; record: (task: PlanningTask) => ComponentProps<typeof MaterialBindingEditor>['record'] };
export function PrintBindingList({ tasks, record, ...editor }: Props) {
  const [onlyPending, setOnlyPending] = useState(true);
  const prints = tasks.filter(t => bindingFamily(t));
  const pending = prints.filter(t => !bindingMaterial(t, record(t)));
  return <details className="print-binding-list"><summary>プリントの教材対応を確認（未確認{pending.length}／全{prints.length}件）</summary>
    <p>候補はPDFで確認した名称です。課題との対応は未確定です。旧A/B/Sだけでは判断せず、手元の教材を確認して選択・保存してください。保存した対応は同じアカウントの別端末でも共有します。</p>
    <label><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />未確認だけ表示</label>
    <p>共通教材台帳とは未同期です。確定後は各課題の差分JSONを出力できます。</p>
    <div className="print-binding-cards">{(onlyPending ? pending : prints).map(t => <details key={t.id} data-binding-task={t.id}>
      <summary><span>{t.unit}・{SUBJECTS[t.subject as keyof typeof SUBJECTS] ?? t.subject}</span><strong>{t.materialName}</strong><small>{bindingMaterial(t, record(t)) ? '確認済み：' + taskDisplayName(t) : '対応未確認（候補は回・教科・教材種別による）'}</small></summary>
      <MaterialBindingEditor key={t.id + ':' + (record(t)?.revision ?? 0)} {...editor} task={t} record={record(t)} />
    </details>)}</div>
  </details>;
}
