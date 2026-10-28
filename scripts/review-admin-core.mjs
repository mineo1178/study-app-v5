import { createHash } from 'node:crypto';
import { parseQuestions, validateQuestion, validateWeakness } from '../src/review/model.ts';
export const hash = value => createHash('sha256').update(JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)).digest('hex');
export function requireSafe(ok, code) { if (!ok) { const e = new Error(code); e.safeCode = code; throw e; } }
const keys = (v, allowed) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => allowed.includes(k));
export function validateTarget(t) {
  requireSafe(keys(t, ['projectId', 'familyId', 'uid']) && Object.keys(t).length === 3 && typeof t.projectId === 'string' && /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(t.projectId) && [t.familyId, t.uid].every(v => typeof v === 'string' && v.length > 0 && v.length <= 128 && !/[/.]/.test(v)), 'TARGET_REJECTED');
}
export function normalizeManifest(value) {
  if (Array.isArray(value)) value = { schemaVersion: 1, questions: parseQuestions(JSON.stringify(value)).map(q => ({ ...q, published: false })), weaknesses: [] };
  requireSafe(keys(value, ['schemaVersion', 'questions', 'weaknesses']) && value.schemaVersion === 1 && Array.isArray(value.questions) && Array.isArray(value.weaknesses) && value.questions.length + value.weaknesses.length >= 1 && value.questions.length + value.weaknesses.length <= 50, 'MANIFEST_REJECTED');
  value.questions.forEach(q => { validateQuestion(q); requireSafe(typeof q.published === 'boolean', 'PUBLICATION_REQUIRED'); });
  value.weaknesses.forEach(validateWeakness);
  for (const rows of [value.questions, value.weaknesses]) requireSafe(new Set(rows.map(r => r.id)).size === rows.length, 'DUPLICATE_ID');
  return value;
}
export function buildPlan(target, manifest, snapshot) {
  validateTarget(target); manifest = normalizeManifest(manifest);
  requireSafe(Array.isArray(snapshot.members) && snapshot.members.includes(target.uid), 'TARGET_NOT_MEMBER');
  const combined = {};
  for (const [name, max] of [['questions', 200], ['weaknesses', 100]]) {
    const rows = snapshot[name]; requireSafe(Array.isArray(rows) && rows.length <= max, 'COLLECTION_LIMIT');
    combined[name] = new Map(rows.map(row => [row.id, row]));
    for (const row of manifest[name]) {
      const old = combined[name].get(row.id);
      if (name === 'questions' && old && hash(old) !== hash(row)) requireSafe(row.version !== old.version, 'QUESTION_VERSION_CONFLICT');
      combined[name].set(row.id, row);
    }
    requireSafe(combined[name].size <= max, 'COLLECTION_LIMIT');
  }
  const questions = [...combined.questions.values()];
  requireSafe(new Set(questions.map(q => JSON.stringify([q.subject, q.unit, q.prompt]))).size === questions.length, 'DUPLICATE_CONTENT');
  for (const w of combined.weaknesses.values()) requireSafe(w.questionIds.every(id => combined.questions.has(id)), 'UNKNOWN_QUESTION_REFERENCE');
  const before = [], writes = [];
  for (const name of ['questions', 'weaknesses']) for (const row of manifest[name]) {
    const old = snapshot[name].find(v => v.id === row.id) ?? null;
    if (hash(old) !== hash(row)) { before.push({ collection: name, id: row.id, data: old }); writes.push({ collection: name, id: row.id, data: row }); }
  }
  const body = { schemaVersion: 1, targetHash: hash(target), snapshotHash: hash(snapshot), manifest, before, writes };
  return { ...body, digest: hash(body) };
}
export function verifyPlan(plan, target, snapshot) {
  requireSafe(plan && plan.schemaVersion === 1, 'PLAN_REJECTED');
  const rebuilt = buildPlan(target, plan.manifest, snapshot);
  requireSafe(hash(rebuilt) === hash(plan), 'STALE_OR_MODIFIED_PLAN');
  return rebuilt;
}
