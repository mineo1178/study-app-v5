param(
  [Parameter(Mandatory=$true)][string]$Config,
  [Parameter(Mandatory=$true)][string]$Runner,
  [ValidateSet('apply','check','connect')][string]$Mode='apply'
)
$ErrorActionPreference = 'Stop'
$mutex = [Threading.Mutex]::new($false, 'Local\StudyAppV5ScheduleAutoSync')
$locked = $false
try {
  try { $locked = $mutex.WaitOne(0) }
  catch [Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { exit 0 }
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  if ($Mode -eq 'connect') {
    $Host.UI.RawUI.WindowTitle = 'Study Schedule Auto Sync'
    $credential = Get-Credential -Message '既存の学習アプリのメールアドレスとパスワードを入力してください。'
    if (-not $credential) { exit 1 }
    $utf8 = [Text.UTF8Encoding]::new($false)
    $OutputEncoding = $utf8
    $login = @{
      email = $credential.UserName
      password = $credential.GetNetworkCredential().Password
    } | ConvertTo-Json -Compress
    try { $login | & $node $Runner $Mode $Config }
    finally { $login = $null; $credential = $null }
  } else {
    & $node $Runner $Mode $Config
  }
  exit $LASTEXITCODE
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
