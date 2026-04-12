$ErrorActionPreference='Stop'

$base='http://127.0.0.1:8080/api/v1'
$wsBase='ws://127.0.0.1:8080'

$tplBody = @{
  name='ws-heartbeat-template-0.0.9'
  description='0.0.9 ws heartbeat test'
  schemaVersion='0.0.8'
  steps=@(
    @{id='ws-step-open';type='openUrl';position=@{x=1;y=1};data=@{label='Open WS Page';config=@{url='data:text/html,<html><body><h1>WS Heartbeat</h1></body></html>'}}},
    @{id='ws-step-extract';type='extract';position=@{x=2;y=2};data=@{label='Extract WS Title';config=@{selector='h1';saveAs='title';extractType='text'}}}
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 15

$created = Invoke-RestMethod -Uri "$base/templates" -Method Post -ContentType 'application/json' -Body $tplBody
$tplId = $created.data.id

try {
  $startBody = @{ templateId=$tplId; dryRun=$false } | ConvertTo-Json
  $runStart = Invoke-RestMethod -Uri "$base/runs" -Method Post -ContentType 'application/json' -Body $startBody
  $runId = $runStart.data.run.id
  $wsUrl = "$wsBase$($runStart.data.wsUrl)"

  $client = [System.Net.WebSockets.ClientWebSocket]::new()
  $uri = [System.Uri]::new($wsUrl)
  $null = $client.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

  $pingBytes = [System.Text.Encoding]::UTF8.GetBytes('{"type":"PING"}')
  $pingSegment = [System.ArraySegment[byte]]::new($pingBytes)
  $null = $client.SendAsync($pingSegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

  $buffer = New-Object byte[] 32768
  $messages = New-Object System.Collections.Generic.List[object]
  $rawTexts = New-Object System.Collections.Generic.List[string]
  $deadline = (Get-Date).AddSeconds(25)
  $sb = New-Object System.Text.StringBuilder
  $pendingReceive = $null
  $pendingSegment = $null
  $hasPong = $false

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
        $rawTexts.Add($text) | Out-Null
        $obj = $text | ConvertFrom-Json
        if ($obj.type -eq 'PONG') {
          $hasPong = $true
          continue
        }

        $messages.Add($obj) | Out-Null
        if ($obj.type -in @('RUN_SUCCEEDED','RUN_FAILED','RUN_CANCELED')) { break }
      }
    }
  }

  if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $client.Dispose()

  $types = @($messages | ForEach-Object { $_.type })
  $seqList = @($messages | ForEach-Object { [int64]$_.seq })
  $seqAsc = $true
  for ($i=1; $i -lt $seqList.Count; $i++) {
    if ($seqList[$i] -le $seqList[$i-1]) { $seqAsc = $false; break }
  }

  [pscustomobject]@{
    runId = $runId
    templateId = $tplId
    wsUrl = $wsUrl
    checks = [pscustomobject]@{
      hasPong = $hasPong
      hasRunStarted = ($types -contains 'RUN_STARTED')
      hasStepStarted = ($types -contains 'STEP_STARTED')
      hasTerminalEvent = ((@('RUN_SUCCEEDED','RUN_FAILED','RUN_CANCELED') | Where-Object { $types -contains $_ }).Count -gt 0)
      seqStrictlyIncreasing = $seqAsc
    }
    messageCount = $messages.Count
    eventTypes = $types
    rawFrames = $rawTexts
  } | ConvertTo-Json -Depth 10
} finally {
  try {
    Invoke-RestMethod -Uri "$base/runs/$runId" -Method Delete | Out-Null
  } catch {
  }
  try {
    Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null
  } catch {
  }
}