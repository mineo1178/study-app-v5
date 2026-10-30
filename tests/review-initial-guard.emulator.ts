import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { sampleQuestions } from '../src/review/model';
import { hash } from '../scripts/review-admin-core.mjs';
import { executeInitialRegistration, sha256 } from '../scripts/review-initial-guard.mjs';
// Synthetic production-shaped approval is mapped ONLY by this test adapter to localhost demo.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085' || !process.env.REVIEW_ADMIN_SDK_DIR) throw Error('DEDICATED_LOCAL_EMULATOR_REQUIRED');
const sdk = createRequire(join(resolve(process.env.REVIEW_ADMIN_SDK_DIR), 'package.json'));
process.env.METADATA_SERVER_DETECTION = 'none';
const app = sdk('firebase-admin/app').initializeApp({ projectId: 'demo-study-v182' }, 'initial-guard-local');
const db = sdk('firebase-admin/firestore').getFirestore(app);
afterAll(async () => { await db.terminate(); await sdk('firebase-admin/app').deleteApp(app); });
async function fixture(fail = false) {
  const suffix = randomUUID(), family = db.doc('families/initial-guard-' + suffix), target = { projectId: 'study-app-v5', familyId: 'oomine-study-2026', uid: 'synthetic-only' };
  await family.create({ memberUids: [target.uid] });
  const questions = Array.from({ length: 5 }, (_, i) => ({ ...sampleQuestions[0], id: `guard-${i}`, version: 'v1', prompt: `fixture ${i}`, published: false }));
  const manifestText = JSON.stringify({ schemaVersion: 1, questions, weaknesses: [] }), keys = generateKeyPairSync('ed25519');
  const policy = { schemaVersion: 1, target, questionIds: questions.map(q => q.id), manifestSha256: sha256(manifestText), keyFingerprint: sha256(keys.publicKey.export({ type: 'spki', format: 'der' })) };
  const approval = { schemaVersion: 1, purpose: 'initial-five-create-only', approvalId: 'emulator-' + suffix, target, manifestSha256: policy.manifestSha256, actions: questions.map(q => ({ id: q.id, operation: 'create', version: q.version, published: false })), notBefore: Date.now() - 1000, expiresAt: Date.now() + 60000 };
  const input = { policy, approval, signature: sign(null, Buffer.from(hash(approval)), keys.privateKey).toString('base64'), manifestText, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  const ref = (id: string) => { if (!policy.questionIds.includes(id)) throw Error('LOCAL_ID_REJECTED'); return family.collection('questions').doc(id); };
  const read = async (ids: string[], transaction?: { get: (ref: unknown) => Promise<unknown> }) => {
    const get = (r: unknown) => transaction ? transaction.get(r) : (r as { get: () => Promise<unknown> }).get();
    const f = await get(family) as { data: () => { memberUids: string[] } };
    const rows = await Promise.all(ids.map(async id => { const s = await get(ref(id)) as { exists: boolean; data: () => unknown; updateTime: { toProto: () => unknown } }; return { id, data: s.exists ? s.data() : null, updateTime: s.exists ? JSON.stringify(s.updateTime.toProto()) : null }; }));
    return { members: f.data().memberUids, authValid: true, rows };
  };
  const options = { environment: {}, clock: Date.now, audit: async () => {}, backup: { saveAndRestore: async (p: unknown) => structuredClone(p) }, adapter: { target, read, transaction: async (callback: (t: unknown) => Promise<void>) => db.runTransaction(async (tx: { get: (r: unknown) => Promise<unknown>; create: (r: unknown, d: unknown) => void; update: (r: unknown, d: unknown) => void }) => { await callback({ read: (ids: string[]) => read(ids, tx), create: (id: string, data: unknown) => tx.create(ref(id), data) }); if (fail) tx.update(family.collection('questions').doc('never-created'), { invalid: true }); }) } };
  return { input, options, rows: () => family.collection('questions').get(), run: () => executeInitialRegistration(input, options) };
}
describe('approved initial-five transaction against localhost Firestore', () => {
  it('creates exactly five and reconciles rerun without extra changes', async () => { const f = await fixture(); expect((await f.run()).writes).toBe(5); const before = await f.rows(); expect((await f.run()).writes).toBe(0); const after = await f.rows(); expect(after.size).toBe(5); expect(after.docs.map((d: { updateTime: { toMillis: () => number } }) => d.updateTime.toMillis())).toEqual(before.docs.map((d: { updateTime: { toMillis: () => number } }) => d.updateTime.toMillis())); });
  it('backend rejection preserves atomicity after five queued creates', async () => { const f = await fixture(true); await expect(f.run()).rejects.toThrow(); expect((await f.rows()).size).toBe(0); });
  it('backup failure prohibits every document write', async () => { const f = await fixture(); f.options.backup.saveAndRestore = async () => { throw Error('BACKUP_FAILED'); }; await expect(f.run()).rejects.toThrow('BACKUP_FAILED'); expect((await f.rows()).size).toBe(0); });
});
