$ErrorActionPreference='Stop'
$base='http://localhost:8080/api/v1'
$wsBase='ws://localhost:8080'

$tplBody = @{
  name='0.0.5-ws-event-test'
  description='verify outputs artifacts pageAlias contextId'
  schemaVersion='0.0.5'
  steps=@(
    @{
      id='browser-1'
      type='startBrowser'
      position=@{x=1;y=1}
      data=@{
        label='browser'
        config=@{
          onError='abort'
          onComplete='close'
          body=@(
            @{
              id='open-1'
              type='openUrl'
              position=@{x=2;y=2}
              data=@{label='open';config=@{url='https://example.com'}}
            },
            @{
              id='extract-1'
              type='extract'
              position=@{x=3;y=3}
              data=@{label='extract';config=@{selector='h1';saveAs='title';extractType='text'}}
            },
            @{
              id='new-page-1'
              type='newPage'
              position=@{x=4;y=4}
              data=@{label='new page';config=@{pageAlias='tab2';switchToNew=$true}}
            },
            @{
              id='shot-1'
              type='screenshotPage'
              position=@{x=5;y=5}
              data=@{label='shot';config=@{name='ws-0.0.5-shot';format='png'}}
            }
          )
        }
      }
    }
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 30

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
$deadline = (Get-Date).AddSeconds(40)
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
      if ($obj.type -in @('RUN_SUCCEEDED','RUN_FAILED','RUN_CANCELED')) { break }
    }
  }
}

if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
  $null = $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}
$client.Dispose()

$stepSucceeded = @($messages | Where-Object { $_.type -eq 'STEP_SUCCEEDED' })
$extractEvent = $stepSucceeded | Where-Object { $_.payload.stepId -eq 'extract-1' } | Select-Object -First 1
$screenshotEvent = $stepSucceeded | Where-Object { $_.payload.stepId -eq 'shot-1' } | Select-Object -First 1
$newPageEvent = $stepSucceeded | Where-Object { $_.payload.stepId -eq 'new-page-1' } | Select-Object -First 1
$contextEvent = $stepSucceeded | Where-Object { $_.payload.stepId -eq 'browser-1' } | Select-Object -First 1

$result = [pscustomobject]@{
  runId = $runId
  templateId = $tplId
  messageCount = $messages.Count
  eventTypes = @($messages | ForEach-Object { $_.type })
  checks = [pscustomobject]@{
    runSucceeded = (@($messages | Where-Object { $_.type -eq 'RUN_SUCCEEDED' }).Count -gt 0)
    extractOutputsVisible = ($null -ne $extractEvent -and $extractEvent.payload.outputs.title -eq 'Example Domain')
    screenshotArtifactsVisible = ($null -ne $screenshotEvent -and @($screenshotEvent.payload.artifacts).Count -ge 1)
    newPageAliasVisible = ($null -ne $newPageEvent -and $newPageEvent.payload.pageAlias -eq 'tab2')
    contextIdVisible = ($null -ne $contextEvent -and -not [string]::IsNullOrWhiteSpace([string]$contextEvent.payload.contextId))
  }
}

if ($runId) {
  try { Invoke-RestMethod -Uri "$base/runs/$runId" -Method Delete | Out-Null } catch {}
}
if ($tplId) {
  try { Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null } catch {}
}

$result | ConvertTo-Json -Depth 10