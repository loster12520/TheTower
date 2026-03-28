$ErrorActionPreference='Stop'
$base='http://localhost:8080/api/v1'
$wsBase='ws://localhost:8080'
$tempFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'thetower-0.0.5-items.txt')
[System.IO.File]::WriteAllLines($tempFile, @('alpha', 'beta', 'gamma'))

$tplBody = @{
  name='0.0.5-loop-cookie-test'
  description='verify cookies and forEachData runtime'
  schemaVersion='0.0.5'
  steps=@(
    @{
      id='open-1'
      type='openUrl'
      position=@{x=1;y=1}
      data=@{label='open';config=@{url='https://example.com'}}
    },
    @{
      id='set-cookie-1'
      type='executeJs'
      position=@{x=2;y=2}
      data=@{
        label='set cookie'
        config=@{
          javascript='() => { document.cookie = "tower_cookie=test-value; path=/"; return document.cookie; }'
          saveAs='cookieText'
        }
      }
    },
    @{
      id='cookies-before-1'
      type='getCookies'
      position=@{x=3;y=3}
      data=@{label='cookies before';config=@{saveAs='cookiesBefore'}}
    },
    @{
      id='clear-cookies-1'
      type='clearCookies'
      position=@{x=4;y=4}
      data=@{label='clear cookies';config=@{}}
    },
    @{
      id='cookies-after-1'
      type='getCookies'
      position=@{x=5;y=5}
      data=@{label='cookies after';config=@{saveAs='cookiesAfter'}}
    },
    @{
      id='import-text-1'
      type='importText'
      position=@{x=6;y=6}
      data=@{label='import text';config=@{path=$tempFile;saveAs='items'}}
    },
    @{
      id='for-each-data-1'
      type='forEachData'
      position=@{x=7;y=7}
      data=@{
        label='forEachData'
        config=@{
          dataVar='items'
          itemVar='item'
          indexVar='idx'
          body=@(
            @{
              id='loop-execute-1'
              type='executeJs'
              position=@{x=8;y=8}
              data=@{
                label='loop execute'
                config=@{
                  javascript='args => `${args.idx}:${args.item}`'
                  injectVars=@('idx','item')
                  saveAs='lastLoopValue'
                }
              }
            }
          )
        }
      }
    }
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 40

$created = $null
$runStart = $null
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
  $stepStarted = @($messages | Where-Object { $_.type -eq 'STEP_STARTED' })
  $loopEvents = @($stepStarted | Where-Object { $_.payload.stepId -eq 'loop-execute-1' })

  $cookiesBeforeRaw = [string]$runData.outputs.cookiesBefore
  $cookiesAfterRaw = [string]$runData.outputs.cookiesAfter
  $cookiesBefore = if ($cookiesBeforeRaw) { $cookiesBeforeRaw | ConvertFrom-Json } else { @() }
  $cookiesAfter = if ($cookiesAfterRaw) { $cookiesAfterRaw | ConvertFrom-Json } else { @() }
  $beforeHasCookie = @($cookiesBefore | Where-Object { $_.name -eq 'tower_cookie' -and $_.value -eq 'test-value' }).Count -gt 0
  $afterHasCookie = @($cookiesAfter | Where-Object { $_.name -eq 'tower_cookie' }).Count -gt 0

  [pscustomobject]@{
    runId = $runId
    templateId = $tplId
    runStatus = $runData.status
    checks = [pscustomobject]@{
      runSucceeded = ($runData.status -eq 'SUCCEEDED')
      cookieBeforeVisible = $beforeHasCookie
      cookieAfterCleared = (-not $afterHasCookie)
      forEachDataLoopCount = ($loopEvents.Count -eq 3)
      forEachDataStepPathOk = (@($loopEvents | Where-Object { (@($_.payload.stepPath) -join '/') -eq 'for-each-data-1/body/loop-execute-1' }).Count -eq 3)
      lastLoopValuePersisted = ($runData.outputs.lastLoopValue -eq '2:gamma')
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
  if (Test-Path $tempFile) {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
  }
}