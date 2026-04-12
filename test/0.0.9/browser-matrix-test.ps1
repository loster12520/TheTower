$ErrorActionPreference='Stop'

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$backendDir = Join-Path $repoRoot 'backend'
$pythonExe = Join-Path $repoRoot '.venv\Scripts\python.exe'
$backendTest = Join-Path $PSScriptRoot 'backend-test.py'
$browsers = @('chromium', 'firefox', 'edge')
$basePort = 18080

function Wait-Health([string]$baseUrl, [int]$timeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 5
      if ($health.data.status -eq 'ok') {
        return $true
      }
    } catch {
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

$results = New-Object System.Collections.Generic.List[object]

for ($index = 0; $index -lt $browsers.Count; $index++) {
  $browser = $browsers[$index]
  $port = $basePort + $index
  $baseUrl = "http://127.0.0.1:$port/api/v1"
  $command = "`$env:PORT='$port'; `$env:THETOWER_BROWSER='$browser'; Set-Location '$backendDir'; gradle run"
  $process = Start-Process powershell -ArgumentList @('-NoProfile', '-Command', $command) -PassThru

  try {
    if (-not (Wait-Health $baseUrl 120)) {
      $results.Add([pscustomobject]@{
        browser = $browser
        port = $port
        ok = $false
        reason = 'health-timeout'
        passCount = 0
        total = 0
      }) | Out-Null
      continue
    }

    $oldBase = $env:THETOWER_TEST_BASE_URL
    $env:THETOWER_TEST_BASE_URL = $baseUrl
    try {
      $json = & $pythonExe $backendTest | Out-String
    } finally {
      if ($null -eq $oldBase) {
        Remove-Item Env:THETOWER_TEST_BASE_URL -ErrorAction SilentlyContinue
      } else {
        $env:THETOWER_TEST_BASE_URL = $oldBase
      }
    }

    $parsed = $json | ConvertFrom-Json
    $results.Add([pscustomobject]@{
      browser = $browser
      port = $port
      ok = ($parsed.passCount -eq $parsed.total)
      reason = 'completed'
      passCount = $parsed.passCount
      total = $parsed.total
    }) | Out-Null
  } catch {
    $results.Add([pscustomobject]@{
      browser = $browser
      port = $port
      ok = $false
      reason = $_.Exception.Message
      passCount = 0
      total = 0
    }) | Out-Null
  } finally {
    try {
      Stop-Process -Id $process.Id -Force
    } catch {
    }
  }
}

[pscustomobject]@{
  results = $results
} | ConvertTo-Json -Depth 10