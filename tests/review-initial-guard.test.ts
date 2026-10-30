import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtemp, writeFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleQuestions } from '../src/review/model';
import { hash } from '../scripts/review-admin-core.mjs';
import { sha256, verifyInitialApproval, validateInitialEnvironment, executeInitialRegistration } from '../scripts/review-initial-guard.mjs';
import { createWindowsBackup } from '../scripts/review-initial-backup.mjs';
import { openApprovedInitialAdapter } from '../scripts/review-initial-executor.mjs';
const now = 1800000000000;
const keys = generateKeyPairSync('ed25519');
function fixture() {
  const questions = Array.from({ length: 5 }, (_, i) => ({ ...sampleQuestions[0], id: `initial-${i}`, version: 'v1', prompt: `fictional ${i}`, published: false }));
  const manifestText = JSON.stringify({ schemaVersion: 1, questions, weaknesses: [] });
  const policy = { schemaVersion: 1, target: { projectId: 'study-app-v5', familyId: 'oomine-study-2026', uid: 'synthetic-child-only' }, questionIds: questions.map(q => q.id), manifestSha256: sha256(manifestText), keyFingerprint: sha256(keys.publicKey.export({ type: 'spki', format: 'der' })) };
  const approval = { schemaVersion: 1, purpose: 'initial-five-create-only', approvalId: 'synthetic-approval', target: { ...policy.target }, manifestSha256: policy.manifestSha256, actions: questions.map(q => ({ id: q.id, operation: 'create', version: q.version, published: false })), notBefore: now - 1000, expiresAt: now + 60000 };
  const input = { policy, approval, signature: '', manifestText, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  const resign = () => { input.signature = sign(null, Buffer.from(hash(input.approval)), keys.privateKey).toString('base64'); };
  resign(); return { input, resign, questions };
}
function memory(f = fixture()) {
  const rows = new Map<string, { data: unknown; updateTime: string }>(), records: unknown[] = [];
  let writes = 0, failCommit = false;
  const read = async (ids: string[]) => ({ members: [f.input.policy.target.uid], authValid: true, rows: ids.map(id => ({ id, data: structuredClone(rows.get(id)?.data ?? null), updateTime: rows.get(id)?.updateTime ?? null })) });
  const adapter = { target: { ...f.input.policy.target }, read, transaction: async (callback: (t: unknown) => Promise<void>) => { const pending: { id: string; data: unknown }[] = []; await callback({ read, create: (id: string, data: unknown) => { if (rows.has(id)) throw Error('CONFLICT'); pending.push({ id, data }); } }); if (failCommit) throw Error('ATOMIC_REJECTED'); for (const q of pending) rows.set(q.id, { data: q.data, updateTime: 'server-update-time' }); writes += pending.length; } };
  const backup = { saveAndRestore: async (p: unknown) => structuredClone(p) };
  const options = { adapter, backup, audit: async (r: unknown) => { records.push(r); }, clock: () => now, environment: {} };
  return { f, rows, records, options, writes: () => writes, fail: () => { failCommit = true; }, run: () => executeInitialRegistration(f.input, options) };
}
describe('initial five independent approval gate (no production network)', () => {
  it('accepts exact signed project/family/UID/IDs/hash/actions and saves once', async () => {
    const m = memory(); expect(verifyInitialApproval({ ...m.f.input, now }).questions).toHaveLength(5);
    expect(await m.run()).toEqual({ status: 'APPLIED_VERIFIED', writes: 5 });
    expect(await m.run()).toEqual({ status: 'ALREADY_APPLIED', writes: 0 }); expect(m.writes()).toBe(5); expect(m.records).toHaveLength(3);
  });
  it.each(['projectId', 'familyId', 'uid'])('rejects another target %s', field => {
    const f = fixture(); (f.input.approval.target as Record<string, string>)[field] = 'different'; f.resign(); expect(() => verifyInitialApproval({ ...f.input, now })).toThrow('APPROVAL_TARGET_MISMATCH');
  });
  it('rejects a wrong policy project/family, even with a matching signature', () => {
    for (const field of ['projectId', 'familyId']) { const f = fixture(); (f.input.policy.target as Record<string, string>)[field] = 'other-project'; expect(() => verifyInitialApproval({ ...f.input, now })).toThrow('PRODUCTION_TARGET_REJECTED'); }
  });
  it('rejects approved hash but unapproved IDs, unknown fields, deletion/publication/version changes', () => {
    for (const kind of ['id', 'unknown', 'delete', 'published', 'version']) {
      const f = fixture(); const m = JSON.parse(f.input.manifestText);
      if (kind === 'unknown') m.questions[0].extra = true;
      else if (kind === 'delete') f.input.approval.actions[0].operation = 'delete';
      else m.questions[0][kind] = kind === 'published' ? true : 'different';
      f.input.manifestText = JSON.stringify(m); f.input.policy.manifestSha256 = sha256(f.input.manifestText); f.input.approval.manifestSha256 = f.input.policy.manifestSha256; f.resign();
      expect(() => verifyInitialApproval({ ...f.input, now })).toThrow();
    }
  });
  it('rejects any JSON bytes change, invalid signature/key, extra actions and excess lifetime', () => {
    const f = fixture(); expect(() => verifyInitialApproval({ ...f.input, manifestText: f.input.manifestText + ' ', now })).toThrow('MANIFEST_HASH_MISMATCH');
    expect(() => verifyInitialApproval({ ...f.input, signature: 'A'.repeat(86) + '==', now })).toThrow('APPROVAL_SIGNATURE_REJECTED');
    f.input.policy.keyFingerprint = '0'.repeat(64); expect(() => verifyInitialApproval({ ...f.input, now })).toThrow('APPROVAL_KEY_MISMATCH');
    const g = fixture(); g.input.approval.expiresAt = now + 86400001; g.resign(); expect(() => verifyInitialApproval({ ...g.input, now })).toThrow('APPROVAL_EXPIRED_OR_NOT_YET_VALID');
  });
  it.each([now + 60000, now - 1001])('rejects expired/not-yet-valid approval at %s', t => expect(() => verifyInitialApproval({ ...fixture().input, now: t })).toThrow('APPROVAL_EXPIRED_OR_NOT_YET_VALID'));
  it('rejects version conflicts and partial previous application without changing data', async () => {
    const m = memory(); m.rows.set('initial-0', { data: { ...m.f.questions[0], version: 'v0' }, updateTime: 'old' }); await expect(m.run()).rejects.toThrow('EXISTING_QUESTION_OR_VERSION_CONFLICT'); expect(m.writes()).toBe(0);
  });
  it('fails closed on backup error, corrupt roundtrip and audit failure before commit', async () => {
    const a = memory(); a.options.backup.saveAndRestore = async () => { throw Error('BACKUP_FAILED'); }; await expect(a.run()).rejects.toThrow(); expect(a.writes()).toBe(0);
    const b = memory(); b.options.backup.saveAndRestore = async () => ({}); await expect(b.run()).rejects.toThrow('BACKUP_ROUNDTRIP_FAILED'); expect(b.writes()).toBe(0);
    const c = memory(); c.options.audit = async () => { throw Error('AUDIT_FAILED'); }; await expect(c.run()).rejects.toThrow(); expect(c.writes()).toBe(0);
  });
  it('retains atomicity on partial failure and rechecks conflicts after backup', async () => {
    const m = memory(); m.fail(); await expect(m.run()).rejects.toThrow('ATOMIC_REJECTED'); expect(m.rows.size).toBe(0);
    const n = memory(); n.options.backup.saveAndRestore = async p => { n.rows.set('initial-1', { data: n.f.questions[1], updateTime: 'racer' }); return structuredClone(p); }; await expect(n.run()).rejects.toThrow('TRANSACTION_CONFLICT'); expect(n.writes()).toBe(0);
  });
  it('rechecks deadline and target after asynchronous backup', async () => {
    const m = memory(); let t = now; m.options.clock = () => t; m.options.backup.saveAndRestore = async p => { t = now + 60000; return structuredClone(p); }; await expect(m.run()).rejects.toThrow('APPROVAL_EXPIRED_OR_NOT_YET_VALID'); expect(m.writes()).toBe(0);
    const n = memory(); n.options.adapter.target.uid = 'wrong'; await expect(n.run()).rejects.toThrow('ADAPTER_TARGET_MISMATCH');
  });
  it('stops on failed post-write read; rerun reconciles exact completed state', async () => {
    const m = memory(), read = m.options.adapter.read; let reads = 0;
    m.options.adapter.read = async ids => { if (++reads === 2) throw Error('NETWORK_AFTER_COMMIT'); return read(ids); };
    await expect(m.run()).rejects.toThrow('NETWORK_AFTER_COMMIT'); expect(m.writes()).toBe(5); expect((await m.run()).status).toBe('ALREADY_APPLIED'); expect(m.writes()).toBe(5);
  });
  it('rejects dangerous environment overrides and cannot enable production with flags alone', () => {
    for (const key of ['FIRESTORE_EMULATOR_HOST', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_CONFIG', 'NODE_OPTIONS', 'HTTPS_PROXY']) expect(() => validateInitialEnvironment({ [key]: 'unexpected' }, fixture().input.policy.target)).toThrow('INITIAL_ENVIRONMENT_REJECTED');
    for (const args of [['apply'], ['apply', '--force'], ['apply-approved', '--force', 'true'], ['apply-approved'], ['check', '--force', 'true']]) { const r = spawnSync(process.execPath, [resolve('scripts/review-initial-admin.mjs'), ...args], { encoding: 'utf8', windowsHide: true }); expect(r.status).toBe(1); expect(JSON.parse(r.stdout).status).toBe('REJECTED_STOP_AND_RECONCILE'); }
  });
  it('production-shaped executor uses only five approved paths through a credential-free mock SDK', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'initial-sdk-mock-')), f = fixture(), stored = new Map<string, unknown>(), requested: string[] = [];
    const ref = (path: string): object => ({ path, collection: (id: string) => ref(path + '/' + id), doc: (id: string) => ref(path + '/' + id), get: async () => { requested.push(path); if (path === 'families/oomine-study-2026') return { exists: true, data: () => ({ memberUids: [f.input.policy.target.uid] }) }; return { exists: stored.has(path), data: () => stored.get(path), updateTime: { toProto: () => ({ seconds: '1', nanos: 0 }) } }; } });
    const db = { projectId: 'study-app-v5', _settings: { host: 'firestore.googleapis.com' }, doc: ref, terminate: async () => {}, runTransaction: async (callback: (t: unknown) => Promise<void>) => { const pending: [string, unknown][] = []; await callback({ get: (r: { get: () => unknown }) => r.get(), create: (r: { path: string }, data: unknown) => { if (stored.has(r.path)) throw Error('EXISTS'); pending.push([r.path, data]); } }); for (const [p, data] of pending) stored.set(p, data); } };
    Reflect.set(globalThis, '__initialGuardMockSdk', { db, uid: f.input.policy.target.uid });
    await mkdir(join(dir, 'mock'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ exports: { './app': './mock/app.cjs', './firestore': './mock/firestore.cjs', './auth': './mock/auth.cjs' } }));
    // createRequire resolves package names from node_modules, never a real SDK or credentials.
    const pkg = join(dir, 'node_modules/firebase-admin'); await mkdir(join(pkg, 'mock'), { recursive: true });
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'firebase-admin', exports: { './app': './mock/app.cjs', './firestore': './mock/firestore.cjs', './auth': './mock/auth.cjs' } }));
    await writeFile(join(pkg, 'mock/app.cjs'), 'exports.applicationDefault=()=>({mock:true});exports.initializeApp=options=>({options});exports.deleteApp=async()=>{};');
    await writeFile(join(pkg, 'mock/firestore.cjs'), 'exports.initializeFirestore=()=>globalThis.__initialGuardMockSdk.db;');
    await writeFile(join(pkg, 'mock/auth.cjs'), 'exports.getAuth=()=>({getUser:async uid=>{if(uid!==globalThis.__initialGuardMockSdk.uid)throw Error("UID");return {uid,disabled:false};}});');
    let adapter;
    try {
      adapter = await openApprovedInitialAdapter(f.input, dir, {}, () => now);
      const options = { adapter, backup: { saveAndRestore: async (p: unknown) => structuredClone(p) }, audit: async () => {}, environment: {}, clock: () => now };
      expect((await executeInitialRegistration(f.input, options)).writes).toBe(5); expect((await executeInitialRegistration(f.input, options)).writes).toBe(0); expect(stored.size).toBe(5);
      expect(requested.every(p => p === 'families/oomine-study-2026' || p.startsWith(`families/oomine-study-2026/reviewUsers/${f.input.policy.target.uid}/questions/initial-`))).toBe(true);
      await expect(adapter.read(['unapproved'])).rejects.toThrow('QUESTION_ID_NOT_APPROVED');
      db.projectId = 'wrong-project'; await expect(openApprovedInitialAdapter(f.input, dir, {}, () => now)).rejects.toThrow('SDK_TARGET_MISMATCH'); db.projectId = 'study-app-v5';
      db._settings.host = '127.0.0.1:1234'; await expect(openApprovedInitialAdapter(f.input, dir, {}, () => now)).rejects.toThrow('SDK_ENDPOINT_REJECTED');
    } finally { await adapter?.close(); Reflect.deleteProperty(globalThis, '__initialGuardMockSdk'); }
  });
  it.skipIf(process.platform !== 'win32')('uses real DPAPI backup and validates signed files through offline CLI', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'initial-guard-')), privateFolder = join(folder, 'private'), storage = await createWindowsBackup(privateFolder), f = fixture();
    const payload = { synthetic: 'never-store-plaintext', before: [null, null, null, null, null] };
    expect(await storage.saveAndRestore(payload)).toEqual(payload);
    const backupFile = (await readdir(privateFolder)).find(n => n.endsWith('.dpapi'))!; expect(await readFile(join(privateFolder, backupFile), 'utf8')).not.toContain('never-store-plaintext');
    await storage.audit({ status: 'PREPARED', approvalHash: hash(f.input.approval), writes: 0 });
    const policyText = JSON.stringify(f.input.policy);
    const files = { policy: policyText, approval: JSON.stringify(f.input.approval), signature: f.input.signature, manifest: f.input.manifestText, 'public-key': f.input.publicKey };
    for (const [name, value] of Object.entries(files)) await writeFile(join(privateFolder, name), value);
    const env = { ...process.env }; for (const key of Object.keys(env)) if (/^(FIRE|GOOGLE|GCLOUD|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|http_proxy|https_proxy|all_proxy)/.test(key)) delete env[key];
    // Use a currently valid synthetic approval; the CLI owns its real clock.
    f.input.approval.notBefore = Date.now() - 1000; f.input.approval.expiresAt = Date.now() + 60000; f.resign(); await writeFile(join(privateFolder, 'approval'), JSON.stringify(f.input.approval)); await writeFile(join(privateFolder, 'signature'), f.input.signature);
    const args = Object.keys(files).flatMap(name => [`--${name}`, join(privateFolder, name)]);
    const r = spawnSync(process.execPath, [resolve('scripts/review-initial-admin.mjs'), 'check', ...args, '--confirm-policy', sha256(policyText)], { encoding: 'utf8', windowsHide: true, env });
    expect(JSON.parse(r.stdout)).toMatchObject({ status: 'APPROVAL_CHECKED_OFFLINE_ONLY', writes: 0, cloudRequests: 0 }); expect(r.status).toBe(0);
    await expect(createWindowsBackup(folder)).rejects.toThrow();
  }, 60000);
});
