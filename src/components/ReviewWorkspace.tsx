import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { doc, onSnapshot } from "firebase/firestore";
import type { FamilySession } from "../use-family-session";
import { assignedReviewChildren } from "../review/manager-access";
import { loadReviewManagement, saveQuestions, saveWeakness } from "../review/repository";
import type { Question, Weakness } from "../review/model";
import { TestReview } from "./TestReview";
import { ReviewManager } from "./ReviewManager";

export function ReviewWorkspace({ session, familyId, sample, enabled }: { session?: FamilySession; familyId: string; sample: boolean; enabled: boolean }) {
  const [grant, setGrant] = useState<{ phase: "checking" | "ready" | "error"; childUids: string[]; revision: number }>({ phase: "checking", childUids: [], revision: 0 });
  const [manage, setManage] = useState(false);
  const [retry, setRetry] = useState(0);
  const permission = useRef<string[]>([]);
  useEffect(() => {
    if (!enabled || sample || !session) return;
    let live = true, role: unknown, members: unknown, roleReady = false, familyReady = false, failed = false, revision = 0, previousGrant = "";
    const publish = (error = false) => {
      if (!live || !session.active()) return;
      failed ||= error;
      const childUids = !failed && roleReady && familyReady ? assignedReviewChildren(role, members, session.user.uid) : [];
      permission.current = childUids;
      const phase = failed ? "error" : roleReady && familyReady ? "ready" : "checking";
      const signature = `${phase}:${JSON.stringify(childUids)}`;
      if (signature === previousGrant) return;
      previousGrant = signature;
      // Invalidate the entire management subtree before publishing any new grant.
      flushSync(() => setGrant({ phase, childUids, revision: ++revision }));
    };
    const stopRole = onSnapshot(doc(session.database, "families", familyId, "reviewManagers", session.user.uid), { includeMetadataChanges: true }, snapshot => {
      roleReady = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
      role = roleReady ? snapshot.data() : undefined; publish();
    }, () => publish(true));
    const stopFamily = onSnapshot(doc(session.database, "families", familyId), { includeMetadataChanges: true }, snapshot => {
      familyReady = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
      members = familyReady ? snapshot.data()?.memberUids : undefined; publish();
    }, () => publish(true));
    return () => { live = false; permission.current = []; stopRole(); stopFamily(); };
  }, [session, familyId, enabled, sample, retry]);
  if (manage && session && enabled && !sample) return <section aria-label="保護者の復習管理" className="mx-auto w-full max-w-3xl space-y-4 p-4">
    <button className="rounded-xl border bg-white p-3" onClick={() => setManage(false)}>自分の復習へ</button>
    {grant.phase !== "ready" ? <div role="status">{grant.phase === "error" ? "管理権限を確認できません。管理操作を停止しています。" : "管理権限を確認中…"}</div> : grant.childUids.length ?
      <ReviewAdministration key={`${retry}:${grant.revision}`} session={session} familyId={familyId} childrenUids={grant.childUids} allowed={uid => session.active() && permission.current.includes(uid)} /> : <p role="status">管理対象はありません。管理操作を停止しています。</p>}
    {grant.phase === "error" && <button onClick={() => { permission.current = []; setGrant({ phase: "checking", childUids: [], revision: 0 }); setRetry(n => n + 1); }}>管理権限を再確認</button>}
  </section>;
  return <>
    {enabled && !sample && grant.phase === "ready" && grant.childUids.length > 0 && <button className="mx-4 mt-4 rounded-xl border-2 border-slate-400 bg-white p-3 font-bold" onClick={() => setManage(true)}>保護者の管理</button>}
    {enabled && !sample && grant.phase === "error" && <p role="alert" className="p-4 text-sm">管理権限を確認できません。管理機能は利用できません。タブを開き直して再確認してください。</p>}
    <TestReview db={session?.database ?? null} session={session} familyId={familyId} uid={sample ? "sample" : session!.user.uid} sample={sample} enabled={enabled} />
  </>;
}

function ReviewAdministration({ session, familyId, childrenUids, allowed }: { session: FamilySession; familyId: string; childrenUids: string[]; allowed: (uid: string) => boolean }) {
  const [uid, setUid] = useState(childrenUids[0]);
  return <div className="space-y-4" data-review-administration>
    <h2 className="text-xl font-black">保護者の問題管理</h2>
    <label className="block">管理対象の子ども<select aria-label="管理対象の子ども" className="block w-full min-w-0 rounded-xl border bg-white p-3 text-sm" value={uid} onChange={e => setUid(e.target.value)}>{childrenUids.map((id, i) => <option key={id} value={id}>子ども{i + 1}（{id}）</option>)}</select></label>
    <ReviewChildManagement key={uid} session={session} familyId={familyId} uid={uid} allowed={allowed} />
  </div>;
}

function ReviewChildManagement({ session, familyId, uid, allowed }: { session: FamilySession; familyId: string; uid: string; allowed: (uid: string) => boolean }) {
  const [data, setData] = useState<{ questions: Question[]; weaknesses: Weakness[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const live = useRef(true), pending = useRef(false);
  const active = () => live.current && session.active() && allowed(uid);
  useEffect(() => {
    live.current = true;
    let current = true;
    void loadReviewManagement(session.database, familyId, uid).then(value => { if (current && session.active() && allowed(uid)) setData(value); })
      .catch(() => { if (current && session.active()) setError("問題管理を読み込めません。権限・通信を確認してください。"); });
    return () => { current = false; live.current = false; };
  }, [session, familyId, uid, allowed, retry]);
  async function save(questions?: Question[], weakness?: Weakness) {
    if (!active() || pending.current || !data) return false;
    pending.current = true; setBusy(true); setError("");
    try {
      if (questions) {
        const merged = new Map(data.questions.map(q => [q.id, q]));
        for (const q of questions) {
          if (data.questions.some(old => old.id !== q.id && old.subject === q.subject && old.unit === q.unit && old.prompt === q.prompt)) throw new Error("同じ問題が登録されています。編集から選んでください。");
          merged.set(q.id, q);
        }
        if (merged.size > 200) throw new Error("問題は200問までです。");
        await saveQuestions(session.database, familyId, uid, questions, active);
      }
      if (weakness) {
        if (!data.weaknesses.some(w => w.id === weakness.id) && data.weaknesses.length >= 100) throw new Error("苦手情報は100件までです。");
        await saveWeakness(session.database, familyId, uid, weakness, active);
      }
      if (!active()) return false;
      const value = await loadReviewManagement(session.database, familyId, uid);
      if (!active()) return false;
      setData(value); return true;
    } catch (e) { if (active()) setError(`保存できませんでした。${(e as Error).message}`); return false; }
    finally { pending.current = false; if (active()) setBusy(false); }
  }
  return <>
    {error && <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3"><p>{error}</p><button disabled={busy} onClick={() => { setError(""); setData(null); setRetry(n => n + 1); }}>問題管理を再読込</button></div>}
    {!data ? <p role="status">問題管理を読み込み中…</p> : !error && <ReviewManager questions={data.questions} weaknesses={data.weaknesses} onQuestions={q => save(q)} onWeakness={w => save(undefined, w)} busy={busy} />}
  </>;
}
