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

function New-TextExtractTemplate([string]$name, [string]$pattern, [int]$groupIndex = 1) {
  return @{
    name=$name
    description='0.0.8 textExtract edge test'
    schemaVersion='0.0.8'
    steps=@(
      @{id='js-1';type='executeJs';position=@{x=1;y=1};data=@{label='js';config=@{javascript='() => "order=12345"';saveAs='rawText'}}},
      @{id='extract-1';type='textExtract';position=@{x=2;y=2};data=@{label='extract';config=@{input='${rawText}';pattern=$pattern;groupIndex=$groupIndex;saveAs='orderId'}}}
    )
    otherStep=@{nodes=@();edges=@()}
  }
}

try {
  $invalidRegexResult = New-TemplateAndRun (New-TextExtractTemplate 'text-extract-invalid-regex-test' 'order=(' 1)
  Add-Result 'textExtract.invalidRegex' (
    ($invalidRegexResult.run.status -eq 'FAILED') -and
    ($invalidRegexResult.run.error.code -eq 'TT-0400-502')
  ) ("status=" + $invalidRegexResult.run.status + '; code=' + $invalidRegexResult.run.error.code + '; message=' + $invalidRegexResult.run.error.message)

  $noMatchResult = New-TemplateAndRun (New-TextExtractTemplate 'text-extract-no-match-test' 'invoice=(\d+)' 1)
  Add-Result 'textExtract.noMatch' (
    ($noMatchResult.run.status -eq 'FAILED') -and
    ($noMatchResult.run.error.code -eq 'TT-0400-502')
  ) ("status=" + $noMatchResult.run.status + '; code=' + $noMatchResult.run.error.code + '; message=' + $noMatchResult.run.error.message)

  $groupOutOfRangeResult = New-TemplateAndRun (New-TextExtractTemplate 'text-extract-group-range-test' 'order=(\d+)' 2)
  Add-Result 'textExtract.groupIndexOutOfRange' (
    ($groupOutOfRangeResult.run.status -eq 'FAILED') -and
    ($groupOutOfRangeResult.run.error.code -eq 'TT-0400-502')
  ) ("status=" + $groupOutOfRangeResult.run.status + '; code=' + $groupOutOfRangeResult.run.error.code + '; message=' + $groupOutOfRangeResult.run.error.message)

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