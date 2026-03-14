$ErrorActionPreference='Stop'
$base='http://localhost:8080/api/v1'
$wsBase='ws://localhost:8080'

# 目标：验证服务端会消费 incoming 且连接不会因积压断开。
# 方法：启动一次很快结束的 run，然后在同一 WS 连接上持续发送 PING 2 分钟并统计 PONG。

$tplBody = @{
  name='ws-heartbeat-template'
  description='ws heartbeat test'
  schemaVersion='0.0.1'
  steps=@(
    @{id='hb-step-1';type='openUrl';position=@{x=1;y=1};data=@{label='open';config=@{url='data:text/html,<html><body><h1>HB</h1></body></html>'}}}
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
$sb = New-Object System.Text.StringBuilder

$durationSec = 120
$sendIntervalMs = 5000
$deadline = (Get-Date).AddSeconds($durationSec)
$nextSendAt = Get-Date

$pingCount = 0
$pongCount = 0
$closeSeen = $false
$endedBecause = 'deadline'

$pendingReceive = $null
$pendingSegment = $null

try {
  while ((Get-Date) -lt $deadline -and $client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $now = Get-Date

    # 发送 PING
    if ($now -ge $nextSendAt) {
      $pingCount++
      $ping = @{ type='PING'; seq=$pingCount; ts=[int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) } | ConvertTo-Json -Compress
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($ping)
      $seg = [System.ArraySegment[byte]]::new($bytes)
      $null = $client.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      $nextSendAt = $now.AddMilliseconds($sendIntervalMs)
    }

    # 尝试接收（非阻塞太久）
    try {
      if (-not $pendingReceive) {
        $pendingSegment = [System.ArraySegment[byte]]::new($buffer)
        $pendingReceive = $client.ReceiveAsync($pendingSegment, [Threading.CancellationToken]::None)
      }

      if (-not $pendingReceive.Wait(500)) { continue }

      $result = $pendingReceive.Result
      $pendingReceive = $null
      $pendingSegment = $null

      if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
        $closeSeen = $true
        $endedBecause = 'server-close'
        break
      }

      if ($result.Count -gt 0) {
        $chunk = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
        $null = $sb.Append($chunk)
      }

      if ($result.EndOfMessage) {
        $text = $sb.ToString()
        $null = $sb.Clear()

        if (-not [string]::IsNullOrWhiteSpace($text)) {
          # 仅统计 PONG；其他事件忽略
          $obj = $text | ConvertFrom-Json
          if ($obj.type -eq 'PONG') { $pongCount++ }
        }
      }
    } catch {
      $endedBecause = 'exception'
      break
    }
  }
} finally {
  # 清理模板
  try { Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null } catch {}

  if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    try {
      $null = $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    } catch {}
  }
  $client.Dispose()
}

$summary = [pscustomobject]@{
  runId = $runId
  templateId = $tplId
  wsUrl = $wsUrl
  durationSec = $durationSec
  sendIntervalMs = $sendIntervalMs
  endedBecause = $endedBecause
  wsState = $client.State.ToString()
  closeSeen = $closeSeen
  pingCount = $pingCount
  pongCount = $pongCount
  checks = [pscustomobject]@{
    connectionStayedOpen = ($endedBecause -eq 'deadline')
    receivedAnyPong = ($pongCount -gt 0)
  }
}

$summary | ConvertTo-Json -Depth 6
