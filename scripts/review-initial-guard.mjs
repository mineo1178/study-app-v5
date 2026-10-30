// PC-only, initial five creates only. No credentials or network transport in this module.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { normalizeManifest, hash, requireSafe, validateTarget } from './review-admin-core.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...names].sort().join();
const same = (a, b) => hash(a) === hash(b);
const idList = ids => Array.isArray(ids) && ids.length === 5 && ids.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id)) && new Set(ids).size === 5;
export function verifyInitialApproval({ policy, approval, signature, manifestText, publicKey, now = Date.now() }) {
  requireSafe(exact(policy, ['schemaVersion', 'target', 'questionIds', 'manifestSha256', 'keyFingerprint']) && policy.schemaVersion === 1, 'POLICY_REJECTED');
  validateTarget(policy.target);
  requireSafe(policy.target.projectId === 'study-app-v5' && policy.target.familyId === 'oomine-study-2026', 'PRODUCTION_TARGET_REJECTED');
  requireSafe(idList(policy.questionIds) && /^[a-f0-9]{64}$/.test(policy.manifestSha256), 'POLICY_REJECTED');
  requireSafe(exact(approval, ['schemaVersion', 'purpose', 'approvalId', 'target', 'manifestSha256', 'actions', 'notBefore', 'expiresAt']) && approval.schemaVersion === 1 && approval.purpose === 'initial-five-create-only', 'APPROVAL_REJECTED');
  requireSafe(typeof approval.approvalId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(approval.approvalId), 'APPROVAL_REJECTED');
  requireSafe(same(approval.target, policy.target) && approval.manifestSha256 === policy.manifestSha256, 'APPROVAL_TARGET_MISMATCH');
  requireSafe(Number.isSafeInteger(now) && Number.isSafeInteger(approval.notBefore) && Number.isSafeInteger(approval.expiresAt) && approval.expiresAt > approval.notBefore && approval.expiresAt - approval.notBefore <= 86400000 && now >= approval.notBefore && now < approval.expiresAt, 'APPROVAL_EXPIRED_OR_NOT_YET_VALID');
  const key = createPublicKey(publicKey);
  requireSafe(key.asymmetricKeyType === 'ed25519' && sha256(key.export({ type: 'spki', format: 'der' })) === policy.keyFingerprint, 'APPROVAL_KEY_MISMATCH');
  requireSafe(typeof signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(signature) && verify(null, Buffer.from(hash(approval)), key, Buffer.from(signature, 'base64')), 'APPROVAL_SIGNATURE_REJECTED');
  requireSafe(typeof manifestText === 'string' && Buffer.byteLength(manifestText) <= 1000000 && sha256(manifestText) === policy.manifestSha256, 'MANIFEST_HASH_MISMATCH');
  const manifest = JSON.parse(manifestText);
  requireSafe(exact(manifest, ['schemaVersion', 'questions', 'weaknesses']) && Array.isArray(manifest.questions) && manifest.questions.length === 5 && Array.isArray(manifest.weaknesses) && manifest.weaknesses.length === 0, 'INITIAL_FIVE_ONLY');
  normalizeManifest(manifest);
  requireSafe(same(manifest.questions.map(q => q.id).sort(), [...policy.questionIds].sort()), 'QUESTION_ID_NOT_APPROVED');
  const actions = manifest.questions.map(q => ({ id: q.id, operation: 'create', version: q.version, published: q.published })).sort((a, b) => a.id.localeCompare(b.id));
  requireSafe(Array.isArray(approval.actions) && same(approval.actions, actions), 'ACTIONS_NOT_APPROVED');
  return { target: { ...policy.target }, questions: structuredClone(manifest.questions), approvalId: approval.approvalId, approvalHash: hash(approval), manifestSha256: policy.manifestSha256 };
}

export function validateInitialEnvironment(env, target) {
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_CONFIG', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_QUOTA_PROJECT', 'GOOGLE_CLOUD_UNIVERSE_DOMAIN', 'GCE_METADATA_HOST', 'GCE_METADATA_IP', 'FIRESTORE_HOST', 'GOOGLE_API_USE_MTLS_ENDPOINT', 'GOOGLE_API_USE_CLIENT_CERTIFICATE', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'GRPC_DEFAULT_SSL_ROOTS_FILE_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) requireSafe(!env[name], 'INITIAL_ENVIRONMENT_REJECTED');
  requireSafe(target.projectId === 'study-app-v5' && target.familyId === 'oomine-study-2026', 'PRODUCTION_TARGET_REJECTED');
}

// Adapter is injected by a separately reviewed trusted executor; no production connector ships here.
export async function executeInitialRegistration(input, { adapter, backup, audit, clock = Date.now, environment = process.env }) {
  const frozen = structuredClone({ policy: input.policy, approval: input.approval, signature: input.signature, manifestText: input.manifestText, publicKey: input.publicKey });
  const check = () => {
    validateInitialEnvironment(environment, frozen.policy.target);
    const value = verifyInitialApproval({ ...frozen, now: clock() });
    requireSafe(same(adapter.target, value.target), 'ADAPTER_TARGET_MISMATCH');
    return value;
  };
  const approved = check();
  requireSafe(same(adapter.target, approved.target), 'ADAPTER_TARGET_MISMATCH');
  const ids = approved.questions.map(q => q.id).sort();
  const validateSnapshot = state => {
    requireSafe(exact(state, ['members', 'authValid', 'rows']) && state.authValid === true && Array.isArray(state.members) && state.members.includes(approved.target.uid) && Array.isArray(state.rows) && state.rows.length === 5 && same(state.rows.map(r => r.id).sort(), ids), 'SNAPSHOT_REJECTED');
    state.rows.forEach(row => requireSafe(exact(row, ['id', 'data', 'updateTime']) && (row.data === null ? row.updateTime === null : typeof row.updateTime === 'string' && row.updateTime.length > 0), 'SNAPSHOT_REJECTED'));
    return state;
  };
  const complete = state => state.rows.every(row => same(row.data, approved.questions.find(q => q.id === row.id)));
  const empty = state => state.rows.every(row => row.data === null);
  const before = structuredClone(validateSnapshot(await adapter.read(ids)));
  if (complete(before)) {
    await audit({ status: 'ALREADY_APPLIED', approvalHash: approved.approvalHash, writes: 0 });
    return { status: 'ALREADY_APPLIED', writes: 0 };
  }
  requireSafe(empty(before), 'EXISTING_QUESTION_OR_VERSION_CONFLICT');
  const payload = { schemaVersion: 1, target: approved.target, approvalHash: approved.approvalHash, before };
  const backupHash = hash(payload);
  const restored = await backup.saveAndRestore(structuredClone(payload));
  requireSafe(hash(restored) === backupHash, 'BACKUP_ROUNDTRIP_FAILED');
  await audit({ status: 'PREPARED', approvalHash: approved.approvalHash, backupHash, writes: 0 });
  check();
  await adapter.transaction(async transaction => {
    const live = validateSnapshot(await transaction.read(ids));
    requireSafe(same(live, before), 'TRANSACTION_CONFLICT');
    check();
    for (const q of approved.questions) transaction.create(q.id, structuredClone(q));
  });
  const after = validateSnapshot(await adapter.read(ids));
  requireSafe(complete(after), 'POST_WRITE_VERIFICATION_FAILED_STOP');
  await audit({ status: 'APPLIED_VERIFIED', approvalHash: approved.approvalHash, afterHash: hash(after), writes: 5 });
  return { status: 'APPLIED_VERIFIED', writes: 5 };
}
