# Benchmark + SEA smoke test for the minimal Node.js bases

Compare builds **on the same machine**; the numbers are only meaningful within one run.

## Benchmark
`bench.js` — offline, ~10 s per build: process startup, localhost TCP and TLS (PSK, AES-GCM)
throughput, a WebSocket-style XOR mask loop (JIT-bound), PAC-style `FindProxyForURL` calls in a
`vm` context, JSON round-trips. One JSON line per run.

`run-bench.js` runs several builds interleaved (default 5 runs each) and prints medians, each
build's change vs the first one, and the run-to-run spread (differences below it are noise).

```sh
# Linux / macOS
./perf/run-bench.sh official=/path/to/official/node minimal=/path/to/minimal/node
# Windows (PowerShell)
.\perf\run-bench.ps1 official=C:\path\node.exe minimal=C:\path\node-minimal.exe
# any OS, with options
node perf/run-bench.js --runs 7 --json out.json official=... minimal=...
```

## SEA smoke test
`sea-smoke.sh <base> <official-node-same-version>` embeds a tiny script with postject, runs it,
and checks it runs as a SEA, passes user args through, has an empty `execArgv`, and ignores
`NODE_OPTIONS`. Works on Linux, macOS (re-signs ad hoc) and Windows (Git Bash).

## CI
`.github/workflows/node-minimal-base-bench.yml` does both on `ubuntu-latest` and `windows-2022`
against the official Node.js of the same version (32-bit on Windows), taking the bases from earlier
`node-minimal-base` / `node-minimal-base-windows` runs by run ID.
