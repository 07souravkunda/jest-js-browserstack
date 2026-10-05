# Minimal Node.js base — Windows x86 (32-bit)

Builds a small 32-bit `node.exe` for embedding an app as a Node single executable (SEA).
A 32-bit build runs on 64-bit Windows (WoW64), Windows on ARM (x86 emulation) and 32-bit
Windows, so one artifact covers every Windows host.

Workflow: `.github/workflows/node-minimal-base-windows.yml` (push to this branch, or run it
manually with a `node_version`). Output: a run artifact with the `.exe`, a `.zip`, and `SHA256SUMS`.

## What it builds
- Official Node.js source from nodejs.org, SHA-256 checked against `SHASUMS256.txt`.
- `vcbuild.bat release x86 vs2022 without-intl no-cctest nonpm nocorepack` on a `windows-2022`
  runner (64-bit host, Visual Studio 2022), with
  `config_flags=--without-node-options --without-inspector --without-amaro --without-sqlite --without-node-code-cache`
  and `_CL_=/O1` (optimise for size; `release` enables LTCG).
- NASM from Chocolatey for OpenSSL's assembly.

## Checks in the workflow
- Runs on the 64-bit runner under WoW64: `process.arch` must be `ia32`; `NODE_OPTIONS` must be ignored.

## Notes
- Not code-signed: sign after embedding the app.
- For release use, build from an organisation-controlled repository and compare checksums.
