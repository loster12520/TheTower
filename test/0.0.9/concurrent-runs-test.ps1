$ErrorActionPreference='Stop'

$base='http://127.0.0.1:8080/api/v1'

$tplBody = @{
  name='concurrent-runs-template-0.0.9'
  description='0.0.9 concurrent run test'
  schemaVersion='0.0.8'
  steps=@(
    @{id='con-open';type='openUrl';position=@{x=1;y=1};data=@{label='Open Concurrent Page';config=@{url='data:text/html,<html><body><h1 id="title">Concurrent</h1></body></html>'}}},
    @{id='con-wait';type='waitFor';position=@{x=2;y=2};data=@{label='Wait Ready';config=@{selector='#title'}}},
    @{id='con-extract';type='extract';position=@{x=3;y=3};data=@{label='Extract Concurrent Title';config=@{selector='#title';saveAs='title';extractType='text'}}}
  )
  otherStep=@{nodes=@();edges=@()}
} | ConvertTo-Json -Depth 15

$created = Invoke-RestMethod -Uri "$base/templates" -Method Post -ContentType 'application/json' -Body $tplBody
$tplId = $created.data.id
$runIds = New-Object System.Collections.Generic.List[string]

try {
  for ($index=1; $index -le 3; $index++) {
    $startBody = @{ templateId=$tplId; dryRun=$false } | ConvertTo-Json
    $runStart = Invoke-RestMethod -Uri "$base/runs" -Method Post -ContentType 'application/json' -Body $startBody
    $runIds.Add($runStart.data.run.id) | Out-Null
  }

  $deadline = (Get-Date).AddSeconds(35)
  $runStates = @{}
  do {
    Start-Sleep -Milliseconds 800
    foreach ($runId in $runIds) {
      $run = Invoke-RestMethod -Uri "$base/runs/$runId" -Method Get
      $runStates[$runId] = $run.data
    }
    $allTerminal = @($runIds | Where-Object { $runStates[$_].status -in @('SUCCEEDED','FAILED','CANCELED') }).Count -eq $runIds.Count
  } while (-not $allTerminal -and (Get-Date) -lt $deadline)

  $listResponse = Invoke-RestMethod -Uri "$base/runs?templateId=$tplId&limit=20" -Method Get
  $listItems = @($listResponse.data.items)
  $listedRunIds = @($listItems | ForEach-Object { $_.id })
  $statuses = @($runIds | ForEach-Object { $runStates[$_].status })
  $outputs = @($runIds | ForEach-Object { $runStates[$_].outputs.title })
  $uniqueRunIds = @($runIds | Select-Object -Unique)

  [pscustomobject]@{
    templateId = $tplId
    runIds = $runIds
    checks = [pscustomobject]@{
      threeDistinctRunIds = ($uniqueRunIds.Count -eq 3)
      allTerminal = ($statuses.Count -eq 3 -and @($statuses | Where-Object { $_ -in @('SUCCEEDED','FAILED','CANCELED') }).Count -eq 3)
      allSucceeded = (@($statuses | Where-Object { $_ -eq 'SUCCEEDED' }).Count -eq 3)
      listContainsAllRuns = (@($runIds | Where-Object { $listedRunIds -contains $_ }).Count -eq 3)
      outputsIsolated = (@($outputs | Where-Object { $_ -eq 'Concurrent' }).Count -eq 3)
    }
    statuses = $statuses
    outputs = $outputs
    listedRunIds = $listedRunIds
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