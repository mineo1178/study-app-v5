// Windows current-user DPAPI. Plaintext is passed through stdin, never written to disk.
import { mkdir, lstat, realpath, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { requireSafe, hash } from './review-admin-core.mjs';
const powershell = code => input => execFileSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference="Stop";' + code], { input, encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 2000000, env: { ...process.env, PSModulePath: join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/Modules') }, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
export async function privateDirectory(directory, create = false) {
  requireSafe(process.platform === 'win32', 'WINDOWS_DPAPI_REQUIRED');
  const full = resolve(directory);
  if (create) {
    try {
      await mkdir(full);
      powershell('$p=[Console]::In.ReadToEnd();$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);$a.AddAccessRule(([Security.AccessControl.FileSystemAccessRule]::new($s,"FullControl","ContainerInherit,ObjectInherit","None","Allow")));[IO.Directory]::SetAccessControl($p,$a)')(full);
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  requireSafe((await lstat(full)).isDirectory() && !(await lstat(full)).isSymbolicLink() && (await realpath(full)).toLowerCase() === full.toLowerCase(), 'PRIVATE_DIRECTORY_REJECTED');
  powershell('$ErrorActionPreference="Stop";$p=[Console]::In.ReadToEnd();$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[IO.Directory]::GetAccessControl($p);$r=$a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]);if(!$a.AreAccessRulesProtected -or $a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $s.Value -or $r.Count -ne 1 -or $r[0].IdentityReference.Value -ne $s.Value -or $r[0].AccessControlType -ne "Allow" -or ($r[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl){throw "ACL_REJECTED"}')(full);
  return full;
}
export async function createWindowsBackup(directory) {
  const folder = await privateDirectory(directory, true);
  return {
    async saveAndRestore(payload) {
      const raw = Buffer.from(JSON.stringify(payload)).toString('base64'), chunks = [];
      for (let i = 0; i < raw.length; i += 8000) chunks.push(powershell('[void][Reflection.Assembly]::LoadWithPartialName("System.Security");$b=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))')(raw.slice(i, i + 8000)));
      const filename = join(folder, `before-${randomUUID()}.dpapi`);
      await writeFile(filename, JSON.stringify({ schemaVersion: 1, chunks }), { flag: 'wx', mode: 0o600 });
      const envelope = JSON.parse(await readFile(filename, 'utf8'));
      requireSafe(envelope.schemaVersion === 1 && Array.isArray(envelope.chunks), 'BACKUP_REJECTED');
      const restored = envelope.chunks.map(cipher => powershell('[void][Reflection.Assembly]::LoadWithPartialName("System.Security");$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))')(cipher)).join('');
      const value = JSON.parse(Buffer.from(restored, 'base64').toString('utf8'));
      requireSafe(hash(value) === hash(payload), 'BACKUP_ROUNDTRIP_FAILED');
      return value;
    },
    async audit(record) {
      requireSafe(Object.keys(record).every(k => ['status', 'approvalHash', 'backupHash', 'afterHash', 'writes'].includes(k)), 'AUDIT_REJECTED');
      await writeFile(join(folder, `audit-${randomUUID()}.json`), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
    },
  };
}

