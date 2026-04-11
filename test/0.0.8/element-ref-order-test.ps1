$ErrorActionPreference='Stop'

$base='http://localhost:8080/api/v1'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result([string]$name, [bool]$passed, [string]$detail) {
  $results.Add([pscustomobject]@{ name=$name; passed=$passed; detail=$detail }) | Out-Null
}

function Wait-RunTerminal([string]$runId, [int]$timeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $run = Invoke-RestMethod -Uri "$base/runs/$runId" -Method Get
    if ($run.data.status -in @('SUCCEEDED', 'FAILED', 'CANCELED')) {
      return $run.data
    }
    Start-Sleep -Milliseconds 500
  }
  throw "run $runId timeout"
}

function New-TemplateAndRun($body) {
  $created = Invoke-RestMethod -Uri "$base/templates" -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20)
  $tplId = $created.data.id
  try {
    $runStart = Invoke-RestMethod -Uri "$base/runs" -Method Post -ContentType 'application/json' -Body (@{ templateId = $tplId; dryRun = $false } | ConvertTo-Json)
    $run = Wait-RunTerminal $runStart.data.run.id
    return [pscustomobject]@{ templateId = $tplId; run = $run }
  } finally {
    try {
      Invoke-RestMethod -Uri "$base/templates/$tplId" -Method Delete | Out-Null
    } catch {
    }
  }
}

try {
  $pageHtml = 'data:text/html,<html><body><div id="status">idle</div><button class="action" onclick="document.getElementById(''status'').textContent=''clicked-1''">First</button><button class="action" onclick="document.getElementById(''status'').textContent=''clicked-2''">Second</button><button class="action" onclick="document.getElementById(''status'').textContent=''clicked-3''">Third</button></body></html>'

  $result = New-TemplateAndRun @{
    name='element-ref-order-test'
    description='0.0.8 elementRefVar and elementOrder test'
    schemaVersion='0.0.8'
    steps=@(
      @{id='open-1';type='openUrl';position=@{x=1;y=1};data=@{label='open';config=@{url=$pageHtml}}},
      @{id='extract-index-1';type='extract';position=@{x=2;y=2};data=@{label='extract index ref';config=@{selector='.action';saveAs='targetIndex';extractType='elementRef';elementOrder=@{type='index';index=1}}}},
      @{id='click-index-1';type='click';position=@{x=3;y=3};data=@{label='click index ref';config=@{elementRefVar='targetIndex'}}},
      @{id='status-index-1';type='extract';position=@{x=4;y=4};data=@{label='extract index status';config=@{selector='#status';saveAs='indexStatus';extractType='text'}}},
      @{id='extract-last-1';type='extract';position=@{x=5;y=5};data=@{label='extract last ref';config=@{selector='.action';saveAs='targetLast';extractType='elementRef';elementOrder=@{type='last'}}}},
      @{id='click-last-1';type='click';position=@{x=6;y=6};data=@{label='click last ref';config=@{elementRefVar='targetLast'}}},
      @{id='status-last-1';type='extract';position=@{x=7;y=7};data=@{label='extract last status';config=@{selector='#status';saveAs='lastStatus';extractType='text'}}},
      @{id='extract-random-1';type='extract';position=@{x=8;y=8};data=@{label='extract random ref';config=@{selector='.action';saveAs='targetRandom';extractType='elementRef';elementOrder=@{type='random'}}}},
      @{id='click-random-1';type='click';position=@{x=9;y=9};data=@{label='click random ref';config=@{elementRefVar='targetRandom'}}},
      @{id='status-random-1';type='extract';position=@{x=10;y=10};data=@{label='extract random status';config=@{selector='#status';saveAs='randomStatus';extractType='text'}}}
    )
    otherStep=@{nodes=@();edges=@()}
  }

  Add-Result 'elementRef.index' (
    ($result.run.status -eq 'SUCCEEDED') -and
    ($result.run.outputs.indexStatus -eq 'clicked-2')
  ) ("indexStatus=" + $result.run.outputs.indexStatus)

  Add-Result 'elementRef.last' (
    ($result.run.status -eq 'SUCCEEDED') -and
    ($result.run.outputs.lastStatus -eq 'clicked-3')
  ) ("lastStatus=" + $result.run.outputs.lastStatus)

  Add-Result 'elementRef.random' (
    ($result.run.status -eq 'SUCCEEDED') -and
    (@('clicked-1', 'clicked-2', 'clicked-3') -contains $result.run.outputs.randomStatus)
  ) ("randomStatus=" + $result.run.outputs.randomStatus)

  [pscustomobject]@{
    passCount = (@($results | Where-Object { $_.passed }).Count)
    total = $results.Count
    results = $results
  } | ConvertTo-Json -Depth 8
} catch {
  [pscustomobject]@{
    fatal = $_.Exception.Message
    results = $results
  } | ConvertTo-Json -Depth 8
}