$ErrorActionPreference='Stop'
$base='http://localhost:8080/api/v1'
$wsBase='ws://localhost:8080'

$tplBody = @{
  name='if-step-path-test'
  description='0.0.4 if step path test'
  schemaVersion='0.0.4'
  steps=@(
    @{
      id='if-1'
      type='if'
      position=@{x=1;y=1}
      data=@{
        label='if'
        config=@{
          condition=@{
            left='1'
            op='equals'
            right='1'
          }
          then=@(
            @{
              id='wait-then-1'
              type='waitFor'
              position=@{x=2;y=2}
              data=@{
                label='wait then'
                config=@{waitMs=10}
              }
            }
          )
          else=@(
            @{
              id='wait-else-1'
              type='waitFor'
              position=@{x=3;y=3}
              data=@{
                label='wait else'
                config=@{waitMs=10}
              }
            }
          )
        }
      }
    }
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 20

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
$deadline = (Get-Date).AddSeconds(20)
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

$stepStartedEvents = @($messages | Where-Object { $_.type -eq 'STEP_STARTED' })
$rootIfEvent = $stepStartedEvents | Where-Object { $_.payload.stepId -eq 'if-1' } | Select-Object -First 1
$thenEvent = $stepStartedEvents | Where-Object { $_.payload.stepId -eq 'wait-then-1' } | Select-Object -First 1
$elseEvent = $stepStartedEvents | Where-Object { $_.payload.stepId -eq 'wait-else-1' } | Select-Object -First 1

$result = [pscustomobject]@{
  runId = $runId
  templateId = $tplId
  messageCount = $messages.Count
  eventTypes = @($messages | ForEach-Object { $_.type })
  checks = [pscustomobject]@{
    schemaVersionAccepted = ($created.data.schemaVersion -eq '0.0.4')
    stepCountIncludesChildren = ($created.data.stats.stepCount -eq 3)
    rootIfStepStarted = ($null -ne $rootIfEvent)
    rootIfPathOk = ($null -ne $rootIfEvent -and @($rootIfEvent.payload.stepPath) -join '/' -eq 'if-1')
    thenStepStarted = ($null -ne $thenEvent)
    thenStepPathOk = ($null -ne $thenEvent -and @($thenEvent.payload.stepPath) -join '/' -eq 'if-1/then/wait-then-1')
    elseNotExecuted = ($null -eq $elseEvent)
    terminalSucceeded = (@($messages | Where-Object { $_.type -eq 'RUN_SUCCEEDED' }).Count -gt 0)
  }
}

Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null

$result | ConvertTo-Json -Depth 10