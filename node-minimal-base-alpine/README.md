# node-minimal-base-alpine

Minimal, size-optimised, **fully static** Node.js for linux-x64 musl (Alpine).

- Built in `alpine:3.17` (gcc 12.2, the minimum for Node 22) with `--fully-static`, so the
  binary has no runtime dependency on musl/libstdc++ and runs on any Alpine version (and on glibc hosts).
- Same minimal feature flags as the glibc bases: no ICU, inspector, sqlite, amaro, code cache,
  `NODE_OPTIONS` support; LTO; `-Os` by default (`-O2` via the `opt` input).
- The workflow checks it runs on `alpine:3.8` and `alpine:latest`, smoke-tests it as a single
  executable application (SEA) inside Alpine, and benchmarks it against the unofficial
  `linux-x64-musl` build of the same version (`perf/`).

Recipe adapted from nodejs/unofficial-builds `recipes/musl` (MIT).
