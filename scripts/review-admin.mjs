// Node 24+: trusted PC-only tool. Never imported by the application.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, relative, isAbsolute, join, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeManifest, validateConnectionTarget, buildPlan, verifyPlan, requireSafe } from './review-admin-core.mjs';
// SDK diagnostics can include document paths; never print them to the operator log.
console.log = console.info = console.warn = console.error = console.debug = () => {};
delete process.env.NODE_DEBUG; delete process.env.GRPC_TRACE; delete process.env.GRPC_VERBOSITY;
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), command = args.shift(), opts = {};
let app, db, deleteApp;
const read = async p => { requireSafe(typeof p === 'string', 'FILE_REQUIRED'); const s = await readFile(resolve(p), 'utf8'); requireSafe(s.length <= 1000000, 'INPUT_TOO_LARGE'); return JSON.parse(s); };
function privatePath(p) {
  requireSafe(typeof p === 'string', 'FILE_REQUIRED'); const full = resolve(p), rel = relative(root, full);
  if (rel.split(sep)[0] !== '..' && !isAbsolute(rel)) {
    try { execFileSync('git', ['check-ignore', '--quiet', '--', rel], { cwd: root, stdio: 'ignore', windowsHide: true }); }
    catch { requireSafe(false, 'FILE_MUST_BE_OUTSIDE_GIT_OR_IGNORED'); }
  }
  return full;
}
const output = async (p, value) => writeFile(privatePath(p), JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
const summary = value => process.stdout.write(JSON.stringify(value) + '\n');
try {
  requireSafe(['prepare', 'export', 'plan', 'apply'].includes(command), 'COMMAND_REQUIRED');
  const allowed = ['input', 'output', 'target', 'plan', 'confirm-project', 'confirm-family', 'confirm-plan'];
  while (args.length) { const flag = args.shift(); requireSafe(flag?.startsWith('--'), 'ARGUMENT_REJECTED'); const key = flag.slice(2); requireSafe(allowed.includes(key) && !Object.hasOwn(opts, key) && args.length > 0, 'ARGUMENT_REJECTED'); opts[key] = args.shift(); }
  if (command === 'prepare') {
    const manifest = normalizeManifest(await read(privatePath(opts.input))); await output(opts.output, manifest);
    summary({ status: 'PREPARED_LOCAL_ONLY', questions: manifest.questions.length, weaknesses: manifest.weaknesses.length, writes: 0 });
  } else {
    const target = await read(privatePath(opts.target)); validateConnectionTarget(target);
    requireSafe(opts['confirm-project'] === target.projectId && opts['confirm-family'] === target.familyId, 'TARGET_CONFIRMATION_REQUIRED');
    const emulator = process.env.FIRESTORE_EMULATOR_HOST;
    if (emulator) requireSafe(/^127\.0\.0\.1:\d+$/.test(emulator) && target.projectId.startsWith('demo-') && /^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? ''), 'EMULATOR_SCOPE_REJECTED');
    else requireSafe(!target.projectId.startsWith('demo-') && !process.env.FIREBASE_AUTH_EMULATOR_HOST, 'PROJECT_ENV_MISMATCH');
    requireSafe(!!process.env.REVIEW_ADMIN_SDK_DIR, 'ADMIN_SDK_REQUIRED');
    const rq = createRequire(join(resolve(process.env.REVIEW_ADMIN_SDK_DIR), 'package.json'));
    const sdk = rq('firebase-admin/app'); deleteApp = sdk.deleteApp;
    app = sdk.initializeApp({ projectId: target.projectId, ...(emulator ? {} : { credential: sdk.applicationDefault() }) }, 'review-admin');
    db = rq('firebase-admin/firestore').initializeFirestore(app, { preferRest: !emulator });
    const user = await rq('firebase-admin/auth').getAuth(app).getUser(target.uid);
    requireSafe(user.uid === target.uid && !user.disabled, 'TARGET_AUTH_INVALID');
    const family = db.doc(`families/${target.familyId}`), userRoot = family.collection('reviewUsers').doc(target.uid);
    const snapshot = async transaction => {
      const get = ref => transaction ? transaction.get(ref) : ref.get();
      const f = await get(family); requireSafe(f.exists, 'FAMILY_MISSING');
      const result = { members: f.data().memberUids };
      for (const [name, max] of [['questions', 200], ['weaknesses', 100]]) {
        const s = await get(userRoot.collection(name).limit(max + 1)); requireSafe(s.size <= max, 'COLLECTION_LIMIT');
        result[name] = s.docs.map(d => { const v = d.data(); requireSafe(v.id === d.id, 'DOCUMENT_ID_MISMATCH'); return v; }).sort((a, b) => a.id.localeCompare(b.id));
      }
      requireSafe(Array.isArray(result.members) && result.members.includes(target.uid), 'TARGET_NOT_MEMBER');
      return result;
    };
    if (command === 'export') {
      const state = await snapshot(); await output(opts.output, { schemaVersion: 1, questions: state.questions, weaknesses: state.weaknesses }); summary({ status: 'EXPORTED_PRIVATE_READONLY', questions: state.questions.length, weaknesses: state.weaknesses.length, writes: 0 });
    } else if (command === 'plan') {
      const manifest = normalizeManifest(await read(privatePath(opts.input))); const plan = buildPlan(target, manifest, await snapshot());
      await output(opts.plan, plan); summary({ status: 'DRY_RUN', documentWrites: plan.writes.length, creates: plan.before.filter(v => v.data === null).length, updates: plan.before.filter(v => v.data !== null).length, digest: plan.digest, writes: 0 });
    } else {
      const plan = await read(privatePath(opts.plan)); requireSafe(opts['confirm-plan'] === plan.digest && typeof plan.digest === 'string', 'PLAN_CONFIRMATION_REQUIRED');
      const count = await db.runTransaction(async transaction => {
        const verified = verifyPlan(plan, target, await snapshot(transaction));
        for (const write of verified.writes) transaction.set(userRoot.collection(write.collection).doc(write.id), write.data);
        return verified.writes.length;
      });
      summary({ status: 'APPLIED', documentWrites: count });
    }
  }
} catch (e) { summary({ status: 'REJECTED', code: e.safeCode ?? 'VALIDATION_OR_ADMIN_OPERATION_FAILED' }); process.exitCode = 1; }
finally { await db?.terminate(); if (app) await deleteApp(app); }
