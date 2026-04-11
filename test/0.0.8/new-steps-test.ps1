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
  $keyboardHtml = 'data:text/html,<html><body><input id="box" /><div id="status">idle</div><script>const box=document.getElementById("box");document.addEventListener("keydown",(e)=>{if(e.key==="Enter"){document.getElementById("status").textContent="enter-fired";}if(e.ctrlKey&&e.key.toLowerCase()==="k"){document.getElementById("status").textContent="ctrl-k-fired";e.preventDefault();}});</script></body></html>'

  $keyboardPressResult = New-TemplateAndRun @{
    name='keyboard-press-test'
    description='0.0.8 keyboard press'
    schemaVersion='0.0.8'
    steps=@(
      @{id='open-1';type='openUrl';position=@{x=1;y=1};data=@{label='open';config=@{url=$keyboardHtml}}},
      @{id='focus-1';type='focus';position=@{x=2;y=2};data=@{label='focus';config=@{selector='#box'}}},
      @{id='press-1';type='keyboardPress';position=@{x=3;y=3};data=@{label='press';config=@{key='Enter'}}},
      @{id='extract-1';type='extract';position=@{x=4;y=4};data=@{label='extract';config=@{selector='#status';as='status';mode='text'}}}
    )
    otherStep=@{nodes=@();edges=@()}
  }
  Add-Result 'keyboardPress' (($keyboardPressResult.run.status -eq 'SUCCEEDED') -and ($keyboardPressResult.run.outputs.status -eq 'enter-fired')) ("status=" + $keyboardPressResult.run.outputs.status)

  $keyboardHotkeyResult = New-TemplateAndRun @{
    name='keyboard-hotkey-test'
    description='0.0.8 keyboard hotkey'
    schemaVersion='0.0.8'
    steps=@(
      @{id='open-1';type='openUrl';position=@{x=1;y=1};data=@{label='open';config=@{url=$keyboardHtml}}},
      @{id='focus-1';type='focus';position=@{x=2;y=2};data=@{label='focus';config=@{selector='#box'}}},
      @{id='hotkey-1';type='keyboardHotkey';position=@{x=3;y=3};data=@{label='hotkey';config=@{modifiers=@('Control');key='k'}}},
      @{id='extract-1';type='extract';position=@{x=4;y=4};data=@{label='extract';config=@{selector='#status';as='status';mode='text'}}}
    )
    otherStep=@{nodes=@();edges=@()}
  }
  Add-Result 'keyboardHotkey' (($keyboardHotkeyResult.run.status -eq 'SUCCEEDED') -and ($keyboardHotkeyResult.run.outputs.status -eq 'ctrl-k-fired')) ("status=" + $keyboardHotkeyResult.run.outputs.status)

  $textExtractResult = New-TemplateAndRun @{
    name='text-extract-test'
    description='0.0.8 text extract'
    schemaVersion='0.0.8'
    steps=@(
      @{id='js-1';type='executeJs';position=@{x=1;y=1};data=@{label='js';config=@{javascript='() => "order=12345"';saveAs='rawText'}}},
      @{id='extract-1';type='textExtract';position=@{x=2;y=2};data=@{label='extract';config=@{input='${rawText}';pattern='order=(\d+)';groupIndex=1;saveAs='orderId'}}}
    )
    otherStep=@{nodes=@();edges=@()}
  }
  Add-Result 'textExtract' (($textExtractResult.run.status -eq 'SUCCEEDED') -and ($textExtractResult.run.outputs.orderId -eq '12345')) ("orderId=" + $textExtractResult.run.outputs.orderId)

  $goBackResult = New-TemplateAndRun @{
    name='go-back-test'
    description='0.0.8 go back'
    schemaVersion='0.0.8'
    steps=@(
      @{id='open-1';type='openUrl';position=@{x=1;y=1};data=@{label='open one';config=@{url='data:text/html,page-one'}}},
      @{id='open-2';type='openUrl';position=@{x=2;y=2};data=@{label='open two';config=@{url='data:text/html,page-two'}}},
      @{id='back-1';type='goBack';position=@{x=3;y=3};data=@{label='back';config=@{}}},
      @{id='url-1';type='getUrl';position=@{x=4;y=4};data=@{label='url';config=@{saveAs='activeUrl'}}}
    )
    otherStep=@{nodes=@();edges=@()}
  }
  Add-Result 'goBack' (($goBackResult.run.status -eq 'SUCCEEDED') -and ($goBackResult.run.outputs.activeUrl -like '*page-one*')) ("activeUrl=" + $goBackResult.run.outputs.activeUrl)

  $closeOtherPagesResult = New-TemplateAndRun @{
    name='close-other-pages-test'
    description='0.0.8 close other pages'
    schemaVersion='0.0.8'
    steps=@(
      @{id='new-1';type='newPage';position=@{x=1;y=1};data=@{label='new main';config=@{pageAlias='main';switchToNew=$true}}},
      @{id='open-1';type='openUrl';position=@{x=2;y=2};data=@{label='open main';config=@{url='data:text/html,main-page'}}},
      @{id='new-2';type='newPage';position=@{x=3;y=3};data=@{label='new temp';config=@{pageAlias='temp';switchToNew=$true}}},
      @{id='open-2';type='openUrl';position=@{x=4;y=4};data=@{label='open temp';config=@{url='data:text/html,temp-page'}}},
      @{id='close-1';type='closeOtherPages';position=@{x=5;y=5};data=@{label='close';config=@{keep='alias';pageAlias='main'}}},
      @{id='switch-1';type='switchPage';position=@{x=6;y=6};data=@{label='switch';config=@{matchBy='alias';matchType='equals';value='main'}}},
      @{id='url-1';type='getUrl';position=@{x=7;y=7};data=@{label='url';config=@{saveAs='activeUrl'}}}
    )
    otherStep=@{nodes=@();edges=@()}
  }
  Add-Result 'closeOtherPages' (($closeOtherPagesResult.run.status -eq 'SUCCEEDED') -and ($closeOtherPagesResult.run.outputs.activeUrl -like '*main-page*')) ("activeUrl=" + $closeOtherPagesResult.run.outputs.activeUrl)

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