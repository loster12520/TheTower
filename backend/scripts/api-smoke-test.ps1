$ErrorActionPreference='Stop'
$base='http://localhost:8080/api/v1'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result([string]$name, [bool]$passed, [string]$detail) {
  $results.Add([pscustomobject]@{ name=$name; passed=$passed; detail=$detail }) | Out-Null
}

try {
  $health = Invoke-RestMethod -Uri "$base/health" -Method Get
  Add-Result 'GET /health' ($health.data.status -eq 'ok') ("status=" + $health.data.status)

  $badCreateBody = @{ name=''; schemaVersion='0.0.1'; steps=@(); otherStep=@{nodes=@();edges=@()} } | ConvertTo-Json -Depth 10
  try {
    Invoke-RestMethod -Uri "$base/templates" -Method Post -ContentType 'application/json' -Body $badCreateBody | Out-Null
    Add-Result 'POST /templates bad name' $false 'expected 400 but got success'
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Add-Result 'POST /templates bad name' ($code -eq 400) ("http=" + $code)
  }

  $tplBody = @{
    name='test-template-01'
    description='api test'
    schemaVersion='0.0.1'
    steps=@(
      @{id='step-1';type='openUrl';position=@{x=10;y=10};data=@{label='open';config=@{url='https://example.com'}}},
      @{id='step-2';type='extract';position=@{x=20;y=20};data=@{label='extract';config=@{selector='h1';as='title';mode='text'}}}
    )
    otherStep=@{nodes=@();edges=@()}
  } | ConvertTo-Json -Depth 15

  $created = Invoke-RestMethod -Uri "$base/templates" -Method Post -ContentType 'application/json' -Body $tplBody
  $tplId = $created.data.id
  Add-Result 'POST /templates create' (![string]::IsNullOrWhiteSpace($tplId)) ("id=" + $tplId)

  $list = Invoke-RestMethod -Uri "$base/templates?includeLastRun=true" -Method Get
  $exists = @($list.data.items | Where-Object { $_.id -eq $tplId }).Count -gt 0
  Add-Result 'GET /templates list' $exists ("items=" + $list.data.items.Count)

  $detail = Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Get
  Add-Result 'GET /templates/{id}' ($detail.data.id -eq $tplId) ("name=" + $detail.data.name)

  $patchBody = @{ name='test-template-01-renamed'; description='patched'} | ConvertTo-Json
  $patched = Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Patch -ContentType 'application/json' -Body $patchBody
  Add-Result 'PATCH /templates/{id}' ($patched.data.name -eq 'test-template-01-renamed') ("name=" + $patched.data.name)

  $putBody = @{
    schemaVersion='0.0.1'
    steps=@(
      @{id='step-a';type='waitFor';position=@{x=1;y=1};data=@{label='wait';config=@{waitMs=100}}},
      @{id='step-b';type='click';position=@{x=2;y=2};data=@{label='click';config=@{selector='#btn'}}}
    )
    otherStep=@{nodes=@();edges=@()}
  } | ConvertTo-Json -Depth 15

  $saved = Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Put -ContentType 'application/json' -Body $putBody
  Add-Result 'PUT /templates/{id}' ($saved.data.stats.stepCount -eq 2) ("stepCount=" + $saved.data.stats.stepCount)

  $startBody = @{ templateId=$tplId; dryRun=$false } | ConvertTo-Json
  $runStart = Invoke-RestMethod -Uri "$base/runs" -Method Post -ContentType 'application/json' -Body $startBody
  $runId = $runStart.data.run.id
  Add-Result 'POST /runs start' (![string]::IsNullOrWhiteSpace($runId)) ("runId=" + $runId)

  Start-Sleep -Seconds 1
  $runGet = Invoke-RestMethod -Uri "$base/runs/$runId" -Method Get
  $okStatus = @('RUNNING','SUCCEEDED') -contains $runGet.data.status
  Add-Result 'GET /runs/{id}' $okStatus ("status=" + $runGet.data.status)

  $runList = Invoke-RestMethod -Uri "$base/runs?templateId=$tplId" -Method Get
  $containsRun = @($runList.data.items | Where-Object { $_.id -eq $runId }).Count -gt 0
  Add-Result 'GET /runs list' $containsRun ("total=" + $runList.data.total)

  $restart = Invoke-RestMethod -Uri "$base/runs/$runId/restart" -Method Post
  $runId2 = $restart.data.run.id
  Add-Result 'POST /runs/{id}/restart' (![string]::IsNullOrWhiteSpace($runId2) -and $runId2 -ne $runId) ("newRunId=" + $runId2)

  $cancel = Invoke-RestMethod -Uri "$base/runs/$runId2/cancel" -Method Post
  Add-Result 'POST /runs/{id}/cancel' ($cancel.data.status -eq 'CANCELED') ("status=" + $cancel.data.status)

  $delRun = Invoke-RestMethod -Uri "$base/runs/$runId2" -Method Delete
  Add-Result 'DELETE /runs/{id}' ($delRun.data.deleted -eq $true) ("deleted=" + $delRun.data.deleted)

  $delTpl = Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete
  Add-Result 'DELETE /templates/{id}' ($delTpl.data.deleted -eq $true) ("deleted=" + $delTpl.data.deleted)

  try {
    Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Get | Out-Null
    Add-Result 'GET deleted template' $false 'expected 404'
  } catch {
    $code2 = $_.Exception.Response.StatusCode.value__
    Add-Result 'GET deleted template' ($code2 -eq 404) ("http=" + $code2)
  }

  $passCount = ($results | Where-Object { $_.passed }).Count
  $total = $results.Count
  [pscustomobject]@{
    passCount = $passCount
    total = $total
    results = $results
  } | ConvertTo-Json -Depth 8
} catch {
  [pscustomobject]@{
    fatal = $_.Exception.Message
    results = $results
  } | ConvertTo-Json -Depth 8
}
