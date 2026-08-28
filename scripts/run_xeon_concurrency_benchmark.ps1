<#
.SYNOPSIS
    Runs the OVMS chat-endpoint concurrency benchmark at 1, 5, 10 and 20
    concurrent clients, in sequence, then writes summary.csv / summary.md.

.DESCRIPTION
    Run this ON THE LOAD-GENERATOR MACHINE (a separate computer on the same LAN),
    NOT on the Xeon inference server. It only sends HTTP requests; nothing about
    the server, the model, or the production config is changed.

    Each level: a fixed number of requests are sent, but only `-Concurrency` are
    ever in flight at once (semaphore model inside the Python script).

.EXAMPLE
    ./scripts/run_xeon_concurrency_benchmark.ps1 -Url http://192.168.1.50:8000/v3/chat/completions

.EXAMPLE
    ./scripts/run_xeon_concurrency_benchmark.ps1 `
        -Url http://192.168.1.50:8000/v3/chat/completions `
        -OutputDir eval/results/intel-xeon-e5-2678v3-concurrency `
        -Timeout 180
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Url,

    [string]$Model = 'ov-llm',

    [string]$OutputDir = 'eval/results/intel-xeon-e5-2678v3-concurrency',

    [int]$MaxTokens = 30,

    [double]$Timeout = 120,

    [int]$Warmup = 3,

    [string]$Prompt = '',

    [string]$Python = 'python'
)

$script = Join-Path $PSScriptRoot 'benchmark_ovms_concurrency.py'
if (-not (Test-Path $script)) { throw "benchmark script not found: $script" }

if ($Url -notmatch '/v3/chat/completions/?$') {
    Write-Warning "URL does not end in /v3/chat/completions - continuing anyway: $Url"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Test matrix: concurrency -> measured requests (warmups are extra, per level).
$matrix = @(
    [pscustomobject]@{ Concurrency = 1;  Requests = 10  },
    [pscustomobject]@{ Concurrency = 5;  Requests = 25  },
    [pscustomobject]@{ Concurrency = 10; Requests = 50  },
    [pscustomobject]@{ Concurrency = 20; Requests = 100 }
)

$failed = @()
foreach ($level in $matrix) {
    Write-Host ''
    Write-Host ("=== concurrency {0} / {1} measured requests ===" -f $level.Concurrency, $level.Requests) -ForegroundColor Cyan

    $argv = @(
        $script,
        '--url', $Url,
        '--model', $Model,
        '--concurrency', $level.Concurrency,
        '--requests', $level.Requests,
        '--max-tokens', $MaxTokens,
        '--timeout', $Timeout,
        '--warmup', $Warmup,
        '--output-dir', $OutputDir
    )
    if ($Prompt -ne '') { $argv += @('--prompt', $Prompt) }

    & $Python @argv
    if ($LASTEXITCODE -ne 0) {
        Write-Warning ("concurrency {0} exited with code {1}" -f $level.Concurrency, $LASTEXITCODE)
        $failed += $level.Concurrency
    }
}

Write-Host ''
Write-Host '=== aggregating into summary.csv / summary.md ===' -ForegroundColor Cyan
& $Python $script --summarize $OutputDir

Write-Host ''
if ($failed.Count -gt 0) {
    Write-Warning ("levels with a non-zero exit: {0}" -f ($failed -join ', '))
}
Write-Host ("results: {0}" -f (Resolve-Path $OutputDir))
Write-Host 'Before committing results, fill ovms_version / openvino_version in environment.json.'
