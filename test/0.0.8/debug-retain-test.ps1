$ErrorActionPreference='Stop'

$base='http://localhost:8080/api/v1'
$wsBase='ws://localhost:8080'

$htmlUrl = 'data:text/html,<html><body><h1 id="title">Retain Debug</h1></body></html>'

$tplBody = @{
  name='debug-retain-template'
  description='0.0.8 debug retain test'
  schemaVersion='0.0.8'
  steps=@(
    @{id='step-open-001';type='openUrl';position=@{x=1;y=1};data=@{label='Open Test Page';config=@{url=$htmlUrl}}},
    @{id='step-extract-001';type='extract';position=@{x=2;y=2};data=@{label='Extract Title';config=@{selector='#title';as='title';mode='text'}}}
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 15

$created = Invoke-RestMethod -Uri "$base/templates" -Method Post -ContentType 'application/json' -Body $tplBody
$tplId = $created.data.id

try {
  $startBody = @{
    templateId = $tplId
    dryRun = $false
    debug = @{
      enabled = $true
      openVisibleBrowser = $false
      openDevtools = $false
      previewFps = 2
      previewQuality = 60
      pauseOnStart = $false
      breakpoints = @()
      keepBrowserOnFinish = $true
    }
  } | ConvertTo-Json -Depth 10

  $runStart = Invoke-RestMethod -Uri "$base/runs" -Method Post -ContentType 'application/json' -Body $startBody
  $runId = $runStart.data.run.id
  $wsUrl = "$wsBase$($runStart.data.wsUrl)"

  $client = [System.Net.WebSockets.ClientWebSocket]::new()
  $uri = [System.Uri]::new($wsUrl)
  $null = $client.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

  $buffer = New-Object byte[] 32768
  $messages = New-Object System.Collections.Generic.List[object]
  $deadline = (Get-Date).AddSeconds(25)
  $sb = New-Object System.Text.StringBuilder
  $pendingReceive = $null
  $pendingSegment = $null

  while ((Get-Date) -lt $deadline -and $client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    try {
      if (-not $pendingReceive) {
        $pendingSegment = [System.ArraySegment[byte]]::new($buffer)
        $pendingReceive = $client.ReceiveAsync($pendingSegment, [Threading.CancellationToken]::None)
      }
      if (-not $pendingReceive.Wait(1000)) { continue }
    } catch {
      break
    }

    $result = $pendingReceive.Result
    $pendingReceive = $null
    $pendingSegment = $null
    if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }

    if ($result.Count -gt 0) {
      $chunk = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
      $null = $sb.Append($chunk)
    }

    if ($result.EndOfMessage) {
      $text = $sb.ToString()
      $null = $sb.Clear()
      if (-not [string]::IsNullOrWhiteSpace($text)) {
        $obj = $text | ConvertFrom-Json
        $messages.Add($obj) | Out-Null

        if ($obj.type -eq 'DEBUG_STATUS_CHANGED' -and $obj.payload.status -eq 'COMPLETED_WAITING_CLOSE') {
          break
        }
      }
    }
  }

  if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $client.Dispose()

  $statusEvents = @($messages | Where-Object { $_.type -eq 'DEBUG_STATUS_CHANGED' })
  $stepStarted = @($messages | Where-Object { $_.type -eq 'STEP_STARTED' }) | Select-Object -First 1
  $stepSucceeded = @($messages | Where-Object { $_.type -eq 'STEP_SUCCEEDED' }) | Select-Object -First 1
  $completedWaitingClose = @($statusEvents | Where-Object { $_.payload.status -eq 'COMPLETED_WAITING_CLOSE' }) | Select-Object -First 1

  $debugContext = Invoke-RestMethod -Uri "$base/runs/$runId/debug/context" -Method Get
  $closed = Invoke-RestMethod -Uri "$base/runs/$runId/debug/close" -Method Post

  [pscustomobject]@{
    runId = $runId
    templateId = $tplId
    checks = [pscustomobject]@{
      runStarted = (@($messages | Where-Object { $_.type -eq 'RUN_STARTED' }).Count -gt 0)
      runSucceeded = (@($messages | Where-Object { $_.type -eq 'RUN_SUCCEEDED' }).Count -gt 0)
      completedWaitingClose = ($null -ne $completedWaitingClose)
      stepStartedHasName = ($null -ne $stepStarted -and $stepStarted.payload.stepName -eq 'Open Test Page')
      stepSucceededHasName = ($null -ne $stepSucceeded -and $stepSucceeded.payload.stepName -eq 'Open Test Page')
      debugContextHasStepName = ($debugContext.data.stepName -eq 'Extract Title')
      debugCloseReturnsClosed = ($closed.data.status -eq 'CLOSED')
    }
    debugStatuses = @($statusEvents | ForEach-Object { $_.payload.status })
    currentStepName = $debugContext.data.stepName
    closeStatus = $closed.data.status
  } | ConvertTo-Json -Depth 10
} finally {
  try {
    Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null
  } catch {
  }
}