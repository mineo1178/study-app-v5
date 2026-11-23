param(
  [Parameter(Mandatory=$true)][string]$Config,
  [Parameter(Mandatory=$true)][string]$Runner,
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$name = 'Study Schedule Auto Sync'
$description = 'StudyAppV5 tutor schedule sync (Firebase family account)'
$existing = Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction SilentlyContinue
if ($existing -and $existing.Description -ne $description) { throw '指定のタスク名は別の処理が使用しています。' }
$configPath = (Resolve-Path -LiteralPath $Config).Path
$runnerPath = (Resolve-Path -LiteralPath $Runner).Path
$wrapper = Join-Path $PSScriptRoot 'run-windows.ps1'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$mode = if ($CheckOnly) {'check'} else {'apply'}
$arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File "' + $wrapper + '" -Config "' + $configPath + '" -Runner "' + $runnerPath + '" -Mode ' + $mode
$escapedArguments = [Security.SecurityElement]::Escape($arguments)
$workingDirectory = [Security.SecurityElement]::Escape((Split-Path -Parent $configPath))
$boundary = [DateTimeOffset]::Now.AddMinutes(15).ToString('yyyy-MM-ddTHH:mm:sszzz')
$definition = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
 <RegistrationInfo><Description>$description</Description></RegistrationInfo>
 <Triggers>
  <TimeTrigger><Repetition><Interval>PT15M</Interval></Repetition><StartBoundary>$boundary</StartBoundary><Enabled>true</Enabled></TimeTrigger>
  <LogonTrigger><Enabled>true</Enabled><UserId>$sid</UserId><Delay>PT1M</Delay></LogonTrigger>
 </Triggers>
 <Principals><Principal id="Author"><UserId>$sid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
 <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><StartWhenAvailable>true</StartWhenAvailable><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><Enabled>true</Enabled><Hidden>true</Hidden><ExecutionTimeLimit>PT12M</ExecutionTimeLimit></Settings>
 <Actions Context="Author"><Exec><Command>$exe</Command><Arguments>$escapedArguments</Arguments><WorkingDirectory>$workingDirectory</WorkingDirectory></Exec></Actions>
</Task>
"@
Register-ScheduledTask -TaskName $name -TaskPath '\' -Xml $definition -Force | Select-Object TaskName,State
