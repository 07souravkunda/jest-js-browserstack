// Runs bench.js with each given Node binary, interleaved, and prints the medians.
// The first binary is the baseline; the table shows every other build's change vs it.
//
//   node run-bench.js [--runs N] [--json out.json] <label=path/to/node> [<label=path> ...]
//
// Any Node (>= 14) can run this script; the binaries under test are spawned directly.
// Compare builds on the same machine, with nothing else heavy running.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let runs = 5, jsonOut = null;
const builds = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--runs') runs = parseInt(args[++i], 10);
  else if (args[i] === '--json') jsonOut = args[++i];
  else {
    const eq = args[i].indexOf('=');
    const label = eq > 0 ? args[i].slice(0, eq) : path.basename(args[i]);
    const bin = eq > 0 ? args[i].slice(eq + 1) : args[i];
    builds.push({ label, bin, results: [] });
  }
}
if (builds.length === 0 || !(runs > 0)) {
  console.error('usage: node run-bench.js [--runs N] [--json out.json] <label=node> [<label=node> ...]');
  process.exit(2);
}

const bench = path.join(__dirname, 'bench.js');
const keys = ['startup_ms', 'tcp_MBps', 'tls_MBps', 'wsmask_MBps', 'pac_calls_s', 'json_rt_s'];
const lowerIsBetter = { startup_ms: true };

for (const b of builds) {
  const v = spawnSync(b.bin, ['-p', 'process.version + " " + process.arch'], { encoding: 'utf8' });
  if (v.status !== 0) { console.error(`${b.label}: cannot run ${b.bin}\n${v.stderr || v.error}`); process.exit(1); }
  b.version = v.stdout.trim();
}

// Interleave builds so slow drift on the machine affects all of them equally.
for (let r = 1; r <= runs; r++) {
  for (const b of builds) {
    const p = spawnSync(b.bin, [bench], { encoding: 'utf8', timeout: 10 * 60 * 1000 });
    const line = (p.stdout || '').trim().split('\n').pop();
    let res;
    try { res = JSON.parse(line); } catch (e) { res = { error: `no JSON output (exit ${p.status}) ${p.stderr || ''}`.trim() }; }
    if (res.error) { console.error(`${b.label} run ${r}: ${res.error}`); process.exit(1); }
    b.results.push(res);
    console.error(`run ${r}/${runs} ${b.label}: ${line}`);
  }
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const spread = (a) => { const m = median(a); return m ? ((Math.max(...a) - Math.min(...a)) / m) * 100 : 0; };
for (const b of builds) {
  b.median = {}; b.spread = {};
  for (const k of keys) { const vals = b.results.map((x) => x[k]); b.median[k] = median(vals); b.spread[k] = spread(vals); }
}

const base = builds[0];
const pad = (s, n) => String(s).padStart(n);
console.log(`\nmedian of ${runs} runs on ${process.platform}/${process.arch} (baseline: ${base.label})`);
console.log(pad('build', 14) + keys.map((k) => pad(k, 14)).join(''));
for (const b of builds) console.log(pad(b.label, 14) + keys.map((k) => pad(b.median[k], 14)).join(''));
for (const b of builds.slice(1)) {
  console.log(pad(`${b.label} Δ`, 14) + keys.map((k) => {
    const d = ((b.median[k] / base.median[k]) - 1) * 100;
    const better = lowerIsBetter[k] ? d < 0 : d > 0;
    return pad(`${d >= 0 ? '+' : ''}${d.toFixed(1)}%${Math.abs(d) < 1 ? '' : better ? ' ✓' : ' ✗'}`, 14);
  }).join(''));
}
const maxSpread = Math.max(...builds.map((b) => Math.max(...keys.map((k) => b.spread[k]))));
console.log(`\nmax run-to-run spread: ${maxSpread.toFixed(1)}% — differences smaller than this are noise.`);
for (const b of builds) console.log(`  ${b.label}: ${b.version}  (${b.bin})`);

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({ platform: `${process.platform}/${process.arch}`, runs,
    builds: builds.map(({ label, bin, version, median, spread, results }) => ({ label, bin, version, median, spread, results })) }, null, 2));
}
