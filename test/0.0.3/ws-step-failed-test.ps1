$ErrorActionPreference='Stop'
$base='http://localhost:8080/api/v1'
$wsBase='ws://localhost:8080'

# 构造一个必失败步骤：click 不存在的元素（等待超时后失败）
$tplBody = @{
  name='ws-step-failed-template'
  description='ws step failed test'
  schemaVersion='0.0.1'
  steps=@(
    @{id='ws-step-1';type='openUrl';position=@{x=1;y=1};data=@{label='open';config=@{url='data:text/html,<html><body><h1>WS Fail</h1></body></html>'}}},
    @{id='ws-step-2';type='click';position=@{x=2;y=2};data=@{label='click-missing';config=@{selector='#not-exist'}}}
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 15

$created = Invoke-RestMethod -Uri "$base/templates" -Method Post -ContentType 'application/json' -Body $tplBody
$tplId = $created.data.id

$startBody = @{ templateId=$tplId; dryRun=$false } | ConvertTo-Json
$runStart = Invoke-RestMethod -Uri "$base/runs" -Method Post -ContentType 'application/json' -Body $startBody
$runId = $runStart.data.run.id
$wsUrl = "$wsBase$($runStart.data.wsUrl)"

$client = [System.Net.WebSockets.ClientWebSocket]::new()
$uri = [System.Uri]::new($wsUrl)
$null = $client.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

$buffer = New-Object byte[] 16384
$messages = New-Object System.Collections.Generic.List[object]
$deadline = (Get-Date).AddSeconds(30)
$sb = New-Object System.Text.StringBuilder
$endedBecause = 'deadline'
$pendingReceive = $null
$pendingSegment = $null

while ((Get-Date) -lt $deadline -and $client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
  try {
    if (-not $pendingReceive) {
      $pendingSegment = [System.ArraySegment[byte]]::new($buffer)
      $pendingReceive = $client.ReceiveAsync($pendingSegment, [Threading.CancellationToken]::None)
    }

    if (-not $pendingReceive.Wait(1000)) { continue }

    $result = $pendingReceive.Result
    $pendingReceive = $null
    $pendingSegment = $null
  } catch {
    $endedBecause = 'exception'
    break
  }
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
      if ($obj.type -in @('RUN_SUCCEEDED','RUN_FAILED','RUN_CANCELED')) {
        $endedBecause = 'terminal-event'
        break
      }
    }
  }
}

if ($client.State -ne [System.Net.WebSockets.WebSocketState]::Open -and $endedBecause -eq 'deadline') {
  $endedBecause = 'closed'
}

if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
  $null = $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}
$client.Dispose()

$types = @($messages | ForEach-Object { $_.type })
$hasStepFailed = $types -contains 'STEP_FAILED'
$hasRunFailed = $types -contains 'RUN_FAILED'

$stepFailed = $messages | Where-Object { $_.type -eq 'STEP_FAILED' } | Select-Object -First 1
$runFailed = $messages | Where-Object { $_.type -eq 'RUN_FAILED' } | Select-Object -First 1

$summary = [pscustomobject]@{
  runId = $runId
  templateId = $tplId
  wsUrl = $wsUrl
  endedBecause = $endedBecause
  wsState = $client.State.ToString()
  closeStatus = if ($client.CloseStatus) { $client.CloseStatus.ToString() } else { $null }
  closeStatusDescription = $client.CloseStatusDescription
  messageCount = $messages.Count
  eventTypes = $types
  checks = [pscustomobject]@{
    hasStepFailed = $hasStepFailed
    hasRunFailed = $hasRunFailed
  }
  samples = [pscustomobject]@{
    stepFailed = $stepFailed
    runFailed = $runFailed
  }
}

# 清理模板
Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null

$summary | ConvertTo-Json -Depth 12
