# SETUP-TASK-SCHEDULER.ps1
# Registers two scheduled tasks for the Twilio Web Client:
#   1. TwilioWebClient-Startup  - runs at Windows logon
#   2. TwilioWebClient-Wake     - runs when resuming from sleep/hibernate
#
# Run this script once as Administrator.

$taskName1 = "TwilioWebClient-Startup"
$taskName2 = "TwilioWebClient-Wake"
$taskName3 = "TwilioWebClient-Tray"
$scriptDir  = "C:\Users\anyex\OneDrive\twilio_web_client"
$batchFile  = Join-Path $scriptDir "START-TASK.bat"
$trayBatch  = Join-Path $scriptDir "START-TRAY.bat"
$stopBatch  = Join-Path $scriptDir "STOP-ALL.bat"

# --- Validate paths ---
if (-not (Test-Path $batchFile)) {
    Write-Error "Could not find START-TASK.bat at: $batchFile"
    exit 1
}

# --- Build the action (cmd /c runs the batch and exits) ---
$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$batchFile`"" `
    -WorkingDirectory $scriptDir

# --- Settings: run with highest privileges, hidden window ---
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -MultipleInstances IgnoreNew `
    -Hidden `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable

# ============================================================
# TASK 1: At logon (covers boot + user sign-in)
# ============================================================
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

# Remove existing task if present
if (Get-ScheduledTask -TaskName $taskName1 -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName1 -Confirm:$false
    Write-Host "Removed existing task: $taskName1"
}

Register-ScheduledTask `
    -TaskName  $taskName1 `
    -Action    $action `
    -Trigger   $triggerLogon `
    -Settings  $settings `
    -RunLevel  Highest `
    -Description "Start Twilio Web Client servers at logon" | Out-Null

Write-Host "Created task: $taskName1 (triggers at logon)"

# ============================================================
# TASK 2: On resume from sleep/hibernate (registered via XML)
#   Uses the System event: Microsoft-Windows-Power-Troubleshooter EventID 1
# ============================================================
$wakeTaskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Restart Twilio Web Client servers on wake from sleep</Description>
  </RegistrationInfo>
  <Triggers>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>&lt;QueryList&gt;&lt;Query Id="0" Path="System"&gt;&lt;Select Path="System"&gt;*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription>
    </EventTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>/c "$batchFile"</Arguments>
      <WorkingDirectory>$scriptDir</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

# Remove existing task if present
if (Get-ScheduledTask -TaskName $taskName2 -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName2 -Confirm:$false
    Write-Host "Removed existing task: $taskName2"
}

Register-ScheduledTask -TaskName $taskName2 -Xml $wakeTaskXml -Force | Out-Null

Write-Host "Created task: $taskName2 (triggers on wake from sleep)"

# ============================================================
# TASK 3: Tray icon — at logon (runs as normal user, visible desktop)
# ============================================================
$trayAction = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$trayBatch`"" `
    -WorkingDirectory $scriptDir

$traySettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable

$trayTrigger = New-ScheduledTaskTrigger -AtLogOn

if (Get-ScheduledTask -TaskName $taskName3 -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName3 -Confirm:$false
    Write-Host "Removed existing task: $taskName3"
}

Register-ScheduledTask `
    -TaskName  $taskName3 `
    -Action    $trayAction `
    -Trigger   $trayTrigger `
    -Settings  $traySettings `
    -RunLevel  Limited `
    -Description "Show Twilio Web Client tray icon at logon" | Out-Null

Write-Host "Created task: $taskName3 (tray icon at logon)"
Write-Host ""
Write-Host "================================================"
Write-Host " Scheduled tasks registered successfully!"
Write-Host "================================================"
Write-Host "  $taskName1  -> servers start at every logon"
Write-Host "  $taskName2      -> servers restart on wake from sleep"
Write-Host "  $taskName3         -> tray icon starts at every logon"
Write-Host ""
Write-Host " To remove all tasks later, run:"
Write-Host "   Unregister-ScheduledTask -TaskName '$taskName1' -Confirm:`$false"
Write-Host "   Unregister-ScheduledTask -TaskName '$taskName2' -Confirm:`$false"
Write-Host "   Unregister-ScheduledTask -TaskName '$taskName3' -Confirm:`$false"
Write-Host ""
