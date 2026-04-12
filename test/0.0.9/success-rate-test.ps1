$ErrorActionPreference='Stop'

$base = if ($env:THETOWER_TEST_BASE_URL) { $env:THETOWER_TEST_BASE_URL.TrimEnd('/') } else { 'http://127.0.0.1:8080/api/v1' }
$iterations = if ($env:THETOWER_SUCCESS_RATE_ITERATIONS) { [int]$env:THETOWER_SUCCESS_RATE_ITERATIONS } else { 10 }

$tplBody = @{
  name='success-rate-template-0.0.9'
  description='0.0.9 success rate sample'
  schemaVersion='0.0.8'
  steps=@(
    @{id='sr-open';type='openUrl';position=@{x=1;y=1};data=@{label='Open Success Page';config=@{url='data:text/html,<html><body><h1 id="title">Success Rate</h1></body></html>'}}},
    @{id='sr-extract';type='extract';position=@{x=2;y=2};data=@{label='Extract Success Title';config=@{selector='#title';saveAs='title';extractType='text'}}}
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 15

$created = Invoke-RestMethod -Uri "$base/templates" -Method Post -ContentType 'application/json' -Body $tplBody
$tplId = $created.data.id
$runIds = New-Object System.Collections.Generic.List[string]

try {
  $samples = New-Object System.Collections.Generic.List[object]

  for ($index = 1; $index -le $iterations; $index++) {
    $startedAt = Get-Date
    $startBody = @{ templateId=$tplId; dryRun=$false } | ConvertTo-Json
    $runStart = Invoke-RestMethod -Uri "$base/runs" -Method Post -ContentType 'application/json' -Body $startBody
    $runId = $runStart.data.run.id
    $runIds.Add($runId) | Out-Null

    $deadline = (Get-Date).AddSeconds(30)
    do {
      Start-Sleep -Milliseconds 700
      $run = Invoke-RestMethod -Uri "$base/runs/$runId" -Method Get
      $status = $run.data.status
    } while ($status -notin @('SUCCEEDED','FAILED','CANCELED') -and (Get-Date) -lt $deadline)

    $endedAt = Get-Date
    $durationMs = [math]::Round((New-TimeSpan -Start $startedAt -End $endedAt).TotalMilliseconds, 2)
    $samples.Add([pscustomobject]@{
      runId = $runId
      status = $status
      durationMs = $durationMs
      outputTitle = $run.data.outputs.title
    }) | Out-Null
  }

  $successCount = @($samples | Where-Object { $_.status -eq 'SUCCEEDED' }).Count
  $failureCount = @($samples | Where-Object { $_.status -ne 'SUCCEEDED' }).Count
  $avgDurationMs = if ($samples.Count -gt 0) { [math]::Round((($samples | Measure-Object -Property durationMs -Average).Average), 2) } else { 0 }
  $successRate = if ($samples.Count -gt 0) { [math]::Round(($successCount * 100.0 / $samples.Count), 2) } else { 0 }

  [pscustomobject]@{
    templateId = $tplId
    iterations = $iterations
    successCount = $successCount
    failureCount = $failureCount
    successRate = $successRate
    averageDurationMs = $avgDurationMs
    samples = $samples
  } | ConvertTo-Json -Depth 10
} finally {
  foreach ($runId in $runIds) {
    try {
      Invoke-RestMethod -Uri "$base/runs/$runId" -Method Delete | Out-Null
    } catch {
    }
  }
  try {
    Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null
  } catch {
  }
}