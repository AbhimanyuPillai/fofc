param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $BoothArgs
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentPython = Join-Path $projectRoot 'voice_env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $agentPython)) {
    $agentPython = Join-Path $projectRoot 'venv\Scripts\python.exe'
}
if (-not (Test-Path -LiteralPath $agentPython)) {
    $agentPython = (Get-Command python -ErrorAction Stop).Source
}

$runBooth = Join-Path $projectRoot 'run_booth.py'
$retrySeconds = 2
while ($true) {
    Write-Host "[SUPERVISOR] Starting booth launcher with $agentPython"
    $runTimer = [System.Diagnostics.Stopwatch]::StartNew()
    & $agentPython -u $runBooth @BoothArgs
    $runTimer.Stop()
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host '[SUPERVISOR] Booth launcher exited cleanly.'
        exit 0
    }

    if ($runTimer.Elapsed.TotalSeconds -ge 300) {
        $retrySeconds = 2
    }
    Write-Warning "Booth launcher exited with code $exitCode. Restarting in $retrySeconds seconds."
    Start-Sleep -Seconds $retrySeconds
    $retrySeconds = [Math]::Min($retrySeconds * 2, 60)
}
