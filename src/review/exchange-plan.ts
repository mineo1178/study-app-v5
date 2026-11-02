import { exchangeSchema } from "./exchange-schema";
import { validId, type Question, type Subject } from "./model";
import type { TargetPlan } from "./target-plan";

export type Topic = { topicId: string; subject: Subject; title: string; priority: number; priorityReason: string; weaknessClassification: string; causeStatus: string; scopeRole: string; scopeStatus: string; difficultyFocus: string; recommendedAction: string; evidenceRefs: string[]; questionIds: string[]; coverageStatus: string; coverageReason: string };
export type StudyPlan = { schemaVersion: "1.0.0"; planId: string; revision: number; generatedAt: string; targetExam: { examKey: string; displayName: string; officialName: string | null; date: string; confirmationStatus: string; nameStatus: string; dateStatus: string; scopeStatus: string; mainCurriculumRounds: number[]; reviewCurriculumRounds: number[]; aliases: string[]; unresolvedItems: string[]; evidenceRefs: string[] }; topics: Topic[]; evidenceRefs: string[]; reviewPolicy: { timeZone: string; intervalDays: number[]; dailyQuestionTarget: number; historyOwner: string; selectionOrder: string[]; maxQuestionsPerTopicPerDay: number; minimumSubjectsWhenEnoughEligibleQuestions: number; candidateShortfallPolicy: string; examDateUse: string; difficultyPolicy: string; priorityDefinition: Record<string, string> }; compatibility: Record<string, unknown>; coverageStatus: { status: string; verifiedQuestionIdCount: number; topicsWithVerifiedQuestions: number; totalTopics: number; reason: string } };
export type QuestionBinding = { topicId: string; topicTitle: string; topicSkill: string; subject: Subject; questionId: string; questionVersion: string; questionSha256: string; coverage: "verified" | "partial"; reason: string };
export type Integration = { source: StudyPlan; bindings: QuestionBinding[]; importedAt: number; mappingsImportedAt?: number };
export type RevisionLedger = Record<string, { revision: number; canonical: string }>;
type Schema = { type?: string | string[]; const?: unknown; enum?: unknown[]; required?: string[]; additionalProperties?: boolean; properties?: Record<string, Schema>; items?: Schema; minLength?: number; pattern?: string; minimum?: number; maximum?: number; minItems?: number; uniqueItems?: boolean; format?: string };
function fail(message: string): never { throw new Error(message); }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const canonical = (v: unknown): string => JSON.stringify(Array.isArray(v) ? v.map(x => JSON.parse(canonical(x))) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(canonical(v[k]))])) : v);
const date = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
// The fixed exchange contract uses only these draft-07 keywords. No dynamic schemas or executable input.
function validate(v: unknown, s: Schema, location = "計画") {
  if (s.const !== undefined && canonical(v) !== canonical(s.const)) fail(`${location}の固定値が未対応です。`);
  if (s.enum && !s.enum.includes(v)) fail(`${location}の値が不正です。`);
  const type = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  if (s.type && !(Array.isArray(s.type) ? s.type : [s.type]).some(t => t === type || t === "integer" && Number.isSafeInteger(v))) fail(`${location}の型が違います。`);
  if (typeof v === "string" && (!v.trim() || v.length > 2000 || s.minLength && v.length < s.minLength || s.pattern && !new RegExp(s.pattern).test(v) || s.format === "date" && !date(v) || s.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))))) fail(`${location}の文字・日付が不正です。`);
  if (typeof v === "number" && (!Number.isFinite(v) || s.minimum !== undefined && v < s.minimum || s.maximum !== undefined && v > s.maximum)) fail(`${location}の数値が不正です。`);
  if (Array.isArray(v)) {
    if (v.length > 500 || s.minItems && v.length < s.minItems || s.uniqueItems && new Set(v.map(canonical)).size !== v.length) fail(`${location}の件数・重複を確認してください。`);
    if (s.items) v.forEach((x, i) => validate(x, s.items!, `${location}[${i}]`));
  }
  if (object(v)) {
    if (s.required?.some(k => !Object.hasOwn(v, k)) || s.additionalProperties === false && Object.keys(v).some(k => !Object.hasOwn(s.properties ?? {}, k))) fail(`${location}に不足・未対応項目があります。`);
    for (const [key, child] of Object.entries(s.properties ?? {})) if (Object.hasOwn(v, key)) validate(v[key], child, `${location}.${key}`);
  }
}
export function parseStudyPlan(raw: string, questions: Question[]): StudyPlan {
  if (raw.length > 300000) fail("計画が大きすぎます。");
  const value: unknown = JSON.parse(raw); validate(value, exchangeSchema as Schema);
  const p = value as StudyPlan;
  if (!validId(p.planId) || !validId(p.targetExam.examKey) || p.topics.length > 100 || p.coverageStatus.totalTopics !== p.topics.length || new Set(p.topics.map(t => t.topicId)).size !== p.topics.length) fail("計画ID・単元数・重複を確認してください。");
  const refs = new Set(p.evidenceRefs);
  for (const list of [p.targetExam.evidenceRefs, p.compatibility.evidenceRefs as string[], ...p.topics.map(t => t.evidenceRefs)]) if (list.some(ref => !refs.has(ref))) fail("未知の根拠IDがあります。");
  for (const t of p.topics) {
    if (t.questionIds.some(id => !questions.some(q => q.id === id && q.subject === t.subject && q.published === true))) fail("未知・非公開・別教科の問題IDがあります。");
    if (t.weaknessClassification === "not_assessed_for_target_scope" && t.priority !== 4) fail("未照合の範囲を弱点として優先できません。");
    if ((t.coverageStatus === "verified" || t.coverageStatus === "partial") && !t.questionIds.length || t.coverageStatus === "missing" && t.questionIds.length) fail("単元の問題数と対応状況が一致しません。");
  }
  const ids = new Set(p.topics.filter(t => t.coverageStatus === "verified").flatMap(t => t.questionIds));
  if (p.coverageStatus.verifiedQuestionIdCount !== ids.size || p.coverageStatus.topicsWithVerifiedQuestions !== p.topics.filter(t => t.coverageStatus === "verified").length) fail("対応件数が一致しません。");
  const coverage = p.topics.every(t => t.coverageStatus === "verified") ? "verified" : p.topics.some(t => ["verified", "partial"].includes(t.coverageStatus)) ? "partial" : p.topics.every(t => t.coverageStatus === "missing") ? "missing" : "unverified";
  if (p.coverageStatus.status !== coverage) fail("全体と単元の対応状況が一致しません。");
  const policy = p.reviewPolicy;
  if (canonical(policy.selectionOrder) !== canonical(["app_due_reviews", "target_exam_relevant_observed_needs", "retention_checks", "strength_maintenance"]) || policy.maxQuestionsPerTopicPerDay > 5 || policy.candidateShortfallPolicy !== "report_shortfall_use_only_app_approved_fallback" || policy.examDateUse !== "priority_only_do_not_fabricate_next_review_dates") fail("この復習方針は未対応です。");
  return p;
}
export function updateRevision(ledger: RevisionLedger, p: StudyPlan): RevisionLedger {
  const old = Object.hasOwn(ledger, p.planId) ? ledger[p.planId] : undefined, content = canonical(p);
  if (old && (p.revision < old.revision || p.revision === old.revision && content !== old.canonical)) fail("旧revisionへの巻戻し、または同じrevisionでの内容変更はできません。");
  return { ...ledger, [p.planId]: { revision: p.revision, canonical: content } };
}
export const topicSkill = (t: Topic) => canonical({subject:t.subject,title:t.title,scopeRole:t.scopeRole,scopeStatus:t.scopeStatus,difficultyFocus:t.difficultyFocus,recommendedAction:t.recommendedAction});
export async function questionHash(q: Question) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(q)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function parseBindings(raw: string, p: StudyPlan, questions: Question[]): Promise<QuestionBinding[]> {
  if (raw.length > 100000) fail("対応表が大きすぎます。");
  const value: unknown = JSON.parse(raw);
  if (!object(value) || Object.keys(value).sort().join() !== ["schemaVersion", "planId", "bindings"].sort().join() || value.schemaVersion !== "review-question-bindings/1" || value.planId !== p.planId || !Array.isArray(value.bindings) || value.bindings.length > 200) fail("計画に対応する問題対応表を選んでください。");
  const rows = value.bindings as QuestionBinding[], keys = ["topicId", "topicTitle", "topicSkill", "subject", "questionId", "questionVersion", "questionSha256", "coverage", "reason"] as const;
  for (const b of rows) {
    if (!object(b) || Object.keys(b).sort().join() !== [...keys].sort().join() || keys.some(k => typeof b[k] !== "string" || !(b[k] as string).trim() || (b[k] as string).length > 1000) || !["verified", "partial"].includes(b.coverage)) fail("対応表の形式を確認してください。");
    const t = p.topics.find(t => t.topicId === b.topicId), q = questions.find(q => q.id === b.questionId && q.version === b.questionVersion && q.published === true);
    if (!t || !q || t.subject !== b.subject || q.subject !== b.subject || t.title !== b.topicTitle || topicSkill(t) !== b.topicSkill || t.coverageStatus === "missing" || t.questionIds.length > 0 && !t.questionIds.includes(b.questionId) || t.weaknessClassification === "not_assessed_for_target_scope" || b.questionSha256 !== await questionHash(q)) fail("未知・変更済み・別教科・未照合の問題対応があります。");
  }
  if (new Set(rows.map(b => `${b.topicId}:${b.questionId}`)).size !== rows.length) fail("対応表が重複しています。");
  return rows;
}
export function bindingStillMatches(b: QuestionBinding, p: StudyPlan, questions: Question[]) {
  const t = p.topics.find(t => t.topicId === b.topicId), q = questions.find(q => q.id === b.questionId && q.version === b.questionVersion && q.published === true);
  return !!t && !!q && t.title === b.topicTitle && topicSkill(t) === b.topicSkill && t.coverageStatus !== "missing" && (!t.questionIds.length || t.questionIds.includes(b.questionId)) && t.subject === b.subject && q.subject === b.subject && t.weaknessClassification !== "not_assessed_for_target_scope";
}
export function adaptStudyPlan(source: StudyPlan, bindings: QuestionBinding[], questions: Question[], importedAt: number, mappingsImportedAt?: number): TargetPlan {
  const active = bindings.filter(b => bindingStillMatches(b, source, questions));
  const items = active.map(b => {
    const t = source.topics.find(t => t.topicId === b.topicId)!;
    return { questionId: b.questionId, questionVersion: b.questionVersion, priority: t.priority, reason: `${t.title}を確かめよう。${b.coverage === "partial" ? "一部分の補助確認です。" : "対応する技能の確認です。"} ${b.reason}`, evidence: t.evidenceRefs.join(","), scopeBasis: t.scopeStatus, topicId: t.topicId, classification: t.weaknessClassification };
  }).sort((a, b) => a.priority - b.priority).filter((item, i, all) => all.findIndex(x => x.questionId === item.questionId) === i);
  const gaps = source.topics.filter(t => !active.some(b => b.topicId === t.topicId && b.coverage === "verified")).map(t => `${t.title}：${active.some(b => b.topicId === t.topicId) ? "一部対応・補助確認のみ" : "対応問題なし／未確認"}`);
  return { schemaVersion: 1, label: source.targetExam.displayName, testDay: source.targetExam.date, items, gaps,
    notes: [...source.targetExam.unresolvedItems.map(x => `${x}は未確定です。`), "資料全体の網羅は保証しません。未登録・未照合の資料は別途確認が必要です。", "対応表は保護者の内容照合に基づきます。四択の正解だけで単元全体の定着とは判定しません。"],
    integration: { source, bindings, importedAt, ...(mappingsImportedAt === undefined ? {} : { mappingsImportedAt }) } };
}
