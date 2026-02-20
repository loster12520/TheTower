$ErrorActionPreference='Stop'
$base='http://localhost:8080/api/v1'
$wsBase='ws://localhost:8080'

$tplBody = @{
  name='ws-test-template'
  description='ws test'
  schemaVersion='0.0.1'
  steps=@(
    @{id='ws-step-1';type='openUrl';position=@{x=1;y=1};data=@{label='open';config=@{url='https://example.com'}}},
    @{id='ws-step-2';type='extract';position=@{x=2;y=2};data=@{label='extract';config=@{selector='h1';as='title';mode='text'}}}
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
$client.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

$buffer = New-Object byte[] 4096
$messages = New-Object System.Collections.Generic.List[object]
$deadline = (Get-Date).AddSeconds(8)

while ((Get-Date) -lt $deadline -and $client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
  $segment = [System.ArraySegment[byte]]::new($buffer)
  $receiveTask = $client.ReceiveAsync($segment, [Threading.CancellationToken]::None)
  if (-not $receiveTask.Wait(1000)) { continue }

  $result = $receiveTask.Result
  if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }

  $text = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
  if (-not [string]::IsNullOrWhiteSpace($text)) {
    $obj = $text | ConvertFrom-Json
    $messages.Add($obj) | Out-Null
    if ($obj.type -in @('RUN_SUCCEEDED','RUN_FAILED','RUN_CANCELED')) { break }
  }
}

if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
  $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}
$client.Dispose()

$types = @($messages | ForEach-Object { $_.type })
$hasRunStarted = $types -contains 'RUN_STARTED'
$hasStepStarted = $types -contains 'STEP_STARTED'
$hasTerminal = @('RUN_SUCCEEDED','RUN_FAILED','RUN_CANCELED') | Where-Object { $types -contains $_ }
$seqAsc = $true
$seqList = @($messages | ForEach-Object { [int64]$_.seq })
for ($i=1; $i -lt $seqList.Count; $i++) {
  if ($seqList[$i] -le $seqList[$i-1]) { $seqAsc = $false; break }
}

$summary = [pscustomobject]@{
  runId = $runId
  templateId = $tplId
  wsUrl = $wsUrl
  messageCount = $messages.Count
  eventTypes = $types
  checks = [pscustomobject]@{
    hasRunStarted = $hasRunStarted
    hasStepStarted = $hasStepStarted
    hasTerminalEvent = ($hasTerminal.Count -gt 0)
    seqStrictlyIncreasing = $seqAsc
  }
}

# 清理模板
Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null

$summary | ConvertTo-Json -Depth 10
