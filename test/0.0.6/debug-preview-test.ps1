$ErrorActionPreference='Stop'
$base='http://localhost:8080/api/v1'
$wsBase='ws://localhost:8080'

$tplBody = @{
  name='0.0.6-debug-preview-test'
  description='verify debug preview stream and controls'
  schemaVersion='0.0.6'
  steps=@(
    @{
      id='debug-open-1'
      type='openUrl'
      position=@{x=1;y=1}
      data=@{
        label='open debug page'
        config=@{
          url='data:text/html,<html><body style="font-family:sans-serif"><h1>Debug Stream</h1><p id="tick">frame-0</p><script>let i=0;setInterval(()=>{document.getElementById("tick").textContent=`frame-${++i}`;},200);</script></body></html>'
        }
      }
    },
    @{
      id='debug-wait-1'
      type='waitFor'
      position=@{x=2;y=2}
      data=@{label='wait';config=@{waitMs=1800}}
    }
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 40

$tplId = $null
$runId = $null
$client = $null

try {
  $created = Invoke-RestMethod -Uri "$base/templates" -Method Post -ContentType 'application/json' -Body $tplBody
  $tplId = $created.data.id

  $startBody = @{
    templateId = $tplId
    dryRun = $false
    debug = @{
      enabled = $true
      openVisibleBrowser = $true
      openDevtools = $true
      previewFps = 2
      previewQuality = 60
    }
  } | ConvertTo-Json -Depth 20

  $runStart = Invoke-RestMethod -Uri "$base/runs" -Method Post -ContentType 'application/json' -Body $startBody
  $runId = $runStart.data.run.id
  $wsUrl = "$wsBase$($runStart.data.wsUrl)"

  $client = [System.Net.WebSockets.ClientWebSocket]::new()
  $uri = [System.Uri]::new($wsUrl)
  $null = $client.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

  $buffer = New-Object byte[] 32768
  $messages = New-Object System.Collections.Generic.List[object]
  $sb = New-Object System.Text.StringBuilder
  $pendingReceive = $null
  $pendingSegment = $null
  $openBrowserCalled = $false
  $closeCalled = $false
  $closedEventSeen = $false
  $closedEventAt = $null
  $frameCountAfterClose = 0
  $deadline = (Get-Date).AddSeconds(45)

  while ((Get-Date) -lt $deadline -and $client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    if (-not $pendingReceive) {
      $pendingSegment = [System.ArraySegment[byte]]::new($buffer)
      $pendingReceive = $client.ReceiveAsync($pendingSegment, [Threading.CancellationToken]::None)
    }

    if (-not $pendingReceive.Wait(1000)) {
      if ($closedEventSeen -and $closedEventAt -and ((Get-Date) - $closedEventAt).TotalMilliseconds -ge 1500) {
        break
      }
      continue
    }

    $result = $pendingReceive.Result
    $pendingReceive = $null
    $pendingSegment = $null

    if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }

    if ($result.Count -gt 0) {
      $chunk = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
      $null = $sb.Append($chunk)
    }

    if (-not $result.EndOfMessage) {
      continue
    }

    $text = $sb.ToString()
    $null = $sb.Clear()
    if ([string]::IsNullOrWhiteSpace($text)) {
      continue
    }

    $obj = $text | ConvertFrom-Json
    $messages.Add($obj) | Out-Null

    if ($closedEventSeen -and $obj.type -eq 'DEBUG_FRAME') {
      $frameCountAfterClose++
    }

    if ($obj.type -eq 'DEBUG_SESSION_CLOSED') {
      $closedEventSeen = $true
      $closedEventAt = Get-Date
    }

    $frameEvents = @($messages | Where-Object { $_.type -eq 'DEBUG_FRAME' })
    if (-not $openBrowserCalled -and $frameEvents.Count -ge 2) {
      $openBrowserCalled = $true
      Invoke-RestMethod -Uri "$base/runs/$runId/debug/open-browser" -Method Post | Out-Null
    }

    if ($openBrowserCalled -and -not $closeCalled -and $frameEvents.Count -ge 3) {
      $closeCalled = $true
      Invoke-RestMethod -Uri "$base/runs/$runId/debug/close" -Method Post | Out-Null
    }

    if ($obj.type -in @('RUN_SUCCEEDED', 'RUN_FAILED', 'RUN_CANCELED') -and $closeCalled) {
      break
    }
  }

  if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $client.CloseOutputAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }

  $runDetail = Invoke-RestMethod -Uri "$base/runs/$runId" -Method Get
  $runData = $runDetail.data
  $frameEvents = @($messages | Where-Object { $_.type -eq 'DEBUG_FRAME' })
  $sessionStarted = @($messages | Where-Object { $_.type -eq 'DEBUG_SESSION_STARTED' })
  $sessionClosed = @($messages | Where-Object { $_.type -eq 'DEBUG_SESSION_CLOSED' })
  $statusChanged = @($messages | Where-Object { $_.type -eq 'DEBUG_STATUS_CHANGED' })

  [pscustomobject]@{
    runId = $runId
    templateId = $tplId
    runStatus = $runData.status
    checks = [pscustomobject]@{
      debugSessionStarted = ($sessionStarted.Count -ge 1)
      debugFramesStreaming = ($frameEvents.Count -ge 3)
      debugStatusStreaming = (@($statusChanged | Where-Object { $_.payload.status -eq 'STREAMING' }).Count -ge 1)
      openBrowserEndpointCalled = $openBrowserCalled
      closeDebugEndpointCalled = $closeCalled
      closeEventVisible = ($sessionClosed.Count -ge 1)
      noFramesAfterClose = ($frameCountAfterClose -eq 0)
      runTerminal = ($runData.status -in @('SUCCEEDED','FAILED','CANCELED'))
    }
  } | ConvertTo-Json -Depth 12
}
finally {
  if ($client) {
    try { $client.Dispose() } catch {}
  }
  if ($runId) {
    try { Invoke-RestMethod -Uri "$base/runs/$runId" -Method Delete | Out-Null } catch {}
  }
  if ($tplId) {
    try { Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null } catch {}
  }
}