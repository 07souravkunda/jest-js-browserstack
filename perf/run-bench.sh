#!/usr/bin/env bash
# Linux/macOS wrapper. Example:
#   ./perf/run-bench.sh official=./node-official minimal=./node-minimal
# The first build is the baseline. Uses whatever `node` is on PATH to drive the run
# (or the first binary under test if none is installed).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
driver=$(command -v node || true)
if [ -z "$driver" ]; then first=$1; driver=${first#*=}; fi
exec "$driver" "$here/run-bench.js" --runs "${RUNS:-5}" "$@"
