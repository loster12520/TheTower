$ErrorActionPreference='Stop'
$base='http://localhost:8080/api/v1'
$wsBase='ws://localhost:8080'

$tabOneUrl = 'data:text/html,TabOneActive'
$tabTwoUrl = 'data:text/html,TabTwoActive'

$tplBody = @{
  name='0.0.5-context-page-test'
  description='verify startBrowser with multi-page operations'
  schemaVersion='0.0.5'
  steps=@(
    @{
      id='browser-ctx-1'
      type='startBrowser'
      position=@{x=1;y=1}
      data=@{
        label='browser context'
        config=@{
          onError='abort'
          onComplete='close'
          body=@(
            @{
              id='new-tab-1'
              type='newPage'
              position=@{x=2;y=2}
              data=@{label='new tab 1';config=@{pageAlias='tab1';switchToNew=$true}}
            },
            @{
              id='open-tab-1'
              type='openUrl'
              position=@{x=3;y=3}
              data=@{label='open tab 1';config=@{url=$tabOneUrl}}
            },
            @{
              id='new-tab-2'
              type='newPage'
              position=@{x=4;y=4}
              data=@{label='new tab 2';config=@{pageAlias='tab2';switchToNew=$true}}
            },
            @{
              id='open-tab-2'
              type='openUrl'
              position=@{x=5;y=5}
              data=@{label='open tab 2';config=@{url=$tabTwoUrl}}
            },
            @{
              id='switch-tab-1'
              type='switchPage'
              position=@{x=6;y=6}
              data=@{label='switch tab 1';config=@{matchBy='alias';matchType='equals';value='tab1'}}
            },
            @{
              id='get-url-1'
              type='getUrl'
              position=@{x=7;y=7}
              data=@{label='get active url';config=@{saveAs='activeUrl'}}
            },
            @{
              id='close-tab-2'
              type='closePage'
              position=@{x=8;y=8}
              data=@{label='close tab 2';config=@{pageAlias='tab2'}}
            }
          )
        }
      }
    }
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 40

$runId = $null
$tplId = $null

try {
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

  $runDetail = Invoke-RestMethod -Uri "$base/runs/$runId" -Method Get
  $runData = $runDetail.data
  $stepSucceeded = @($messages | Where-Object { $_.type -eq 'STEP_SUCCEEDED' })
  $switchEvent = $stepSucceeded | Where-Object { $_.payload.stepId -eq 'switch-tab-1' } | Select-Object -First 1
  $closeEvent = $stepSucceeded | Where-Object { $_.payload.stepId -eq 'close-tab-2' } | Select-Object -First 1
  $browserEvent = $stepSucceeded | Where-Object { $_.payload.stepId -eq 'browser-ctx-1' } | Select-Object -First 1

  [pscustomobject]@{
    runId = $runId
    templateId = $tplId
    runStatus = $runData.status
    checks = [pscustomobject]@{
      runSucceeded = ($runData.status -eq 'SUCCEEDED')
      activeUrlPersisted = ([string]$runData.outputs.activeUrl).Contains('TabOneActive')
      switchPageAliasVisible = ($null -ne $switchEvent -and $switchEvent.payload.pageAlias -eq 'tab1')
      closePageFallsBackToTab1 = ($null -ne $closeEvent -and $closeEvent.payload.pageAlias -eq 'tab1')
      browserContextVisible = ($null -ne $browserEvent -and -not [string]::IsNullOrWhiteSpace([string]$browserEvent.payload.contextId))
      bodyStepPathVisible = (@($stepSucceeded | Where-Object { (@($_.payload.stepPath) -join '/') -eq 'browser-ctx-1/body/switch-tab-1' }).Count -eq 1)
    }
  } | ConvertTo-Json -Depth 12
}
finally {
  if ($runId) {
    try { Invoke-RestMethod -Uri "$base/runs/$runId" -Method Delete | Out-Null } catch {}
  }
  if ($tplId) {
    try { Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null } catch {}
  }
}