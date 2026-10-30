// Separate signed-approval entry point. The original CLI still rejects production.
import { readFile, lstat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyInitialApproval, validateInitialEnvironment, sha256, executeInitialRegistration } from './review-initial-guard.mjs';
import { privateDirectory, createWindowsBackup } from './review-initial-backup.mjs';
import { openApprovedInitialAdapter } from './review-initial-executor.mjs';
import { requireSafe } from './review-admin-core.mjs';
console.log = console.info = console.warn = console.error = console.debug = () => {};
let adapter;
const privatePath = path => {
  const full = resolve(path), root = fileURLToPath(new URL('../', import.meta.url)), rel = relative(root, full);
  if (!rel.startsWith('..') && !isAbsolute(rel)) { try { execFileSync('git', ['check-ignore', '--quiet', '--', rel], { cwd: root, stdio: 'ignore', windowsHide: true }); } catch { requireSafe(false, 'FILE_MUST_BE_OUTSIDE_GIT_OR_IGNORED'); } }
  return full;
};
try {
  const args = process.argv.slice(2), command = args.shift(), opts = {};
  requireSafe(['check', 'apply-approved'].includes(command), 'COMMAND_NOT_APPROVED');
  const allowed = ['policy', 'approval', 'signature', 'manifest', 'public-key', 'confirm-policy', ...(command === 'apply-approved' ? ['backup-directory', 'sdk-directory'] : [])];
  while (args.length) {
    const flag = args.shift(); requireSafe(flag?.startsWith('--'), 'ARGUMENT_REJECTED');
    const key = flag.slice(2); requireSafe(allowed.includes(key) && !Object.hasOwn(opts, key) && args.length, 'ARGUMENT_REJECTED'); opts[key] = args.shift();
  }
  requireSafe(Object.keys(opts).length === allowed.length, 'ARGUMENT_REQUIRED');
  const readPrivate = async file => { const full = privatePath(file); await privateDirectory(dirname(full)); const s = await lstat(full); requireSafe(s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && s.size <= 1000000, 'PRIVATE_FILE_REJECTED'); return readFile(full, 'utf8'); };
  const policyText = await readPrivate(opts.policy);
  requireSafe(sha256(policyText) === opts['confirm-policy'], 'POLICY_CONFIRMATION_REQUIRED');
  const policy = JSON.parse(policyText); validateInitialEnvironment(process.env, policy.target);
  const input = { policy, approval: JSON.parse(await readPrivate(opts.approval)), signature: (await readPrivate(opts.signature)).trim(), manifestText: await readPrivate(opts.manifest), publicKey: await readPrivate(opts['public-key']) };
  const approved = verifyInitialApproval(input);
  if (command === 'check') process.stdout.write(JSON.stringify({ status: 'APPROVAL_CHECKED_OFFLINE_ONLY', approvalHash: approved.approvalHash, manifestSha256: approved.manifestSha256, questions: 5, cloudRequests: 0, writes: 0 }) + '\n');
  else {
    // ACL/backup destination checked before any SDK initialization; actual before-data is read later.
    const backup = await createWindowsBackup(privatePath(opts['backup-directory']));
    adapter = await openApprovedInitialAdapter(input, opts['sdk-directory']);
    const result = await executeInitialRegistration(input, { adapter, backup, audit: backup.audit });
    process.stdout.write(JSON.stringify({ ...result, approvalHash: approved.approvalHash }) + '\n');
  }
} catch (e) { process.stdout.write(JSON.stringify({ status: 'REJECTED_STOP_AND_RECONCILE', code: e.safeCode ?? 'APPROVAL_OR_ADMIN_OPERATION_FAILED' }) + '\n'); process.exitCode = 1; }
finally { try { await adapter?.close(); } catch { process.stdout.write(JSON.stringify({ status: 'STOP_AND_RECONCILE', code: 'ADMIN_CLOSE_FAILED' }) + '\n'); process.exitCode = 1; } }
