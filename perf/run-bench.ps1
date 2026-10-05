# Windows wrapper. Example (PowerShell):
#   .\perf\run-bench.ps1 official=C:\bench\node-official.exe minimal=C:\bench\node-minimal.exe
# The first build is the baseline. Uses `node` on PATH to drive the run, or the first
# binary under test if none is installed. Set $env:RUNS to change the run count (default 5).
$ErrorActionPreference = 'Stop'
$runs = if ($env:RUNS) { $env:RUNS } else { '5' }
$driver = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $driver) { $driver = ($args[0] -split '=', 2)[-1] }
& $driver (Join-Path $PSScriptRoot 'run-bench.js') --runs $runs @args
exit $LASTEXITCODE
