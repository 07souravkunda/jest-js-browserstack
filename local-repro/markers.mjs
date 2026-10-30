// Mirrors a functional-test harness: stdout+stderr redirected to one file
// (opened 'w'), then polled. Records when each marker the suite waits/asserts on first appears.
// Usage: node markers.mjs <label> <binary> [arch-prefix]   (key from BSL_KEY)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [label, bin, archPrefix] = process.argv.slice(2);
const KEY = process.env.BSL_KEY;
if (!KEY) { console.error('set BSL_KEY'); process.exit(2); }
// BSL_BS_HOST=prod -> no --bs-host; unset -> preprod.
const BH = process.env.BSL_BS_HOST || 'preprod-local-service.bsstag.com';
const HOST = BH === 'prod' ? [] : ['--bs-host', BH];
const pre = archPrefix ? archPrefix.split(' ') : [];
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), `markers-${label}`);
fs.mkdirSync(OUT, { recursive: true });
const red = (s) => String(s).split(KEY).join('<KEY>');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARKERS = {
  started: 'Started the BrowserStack Binary server',
  success: '[SUCCESS] You can now access your local server',
  json: /\{"stat(e|us)":.*,"message":.*\}/,
  error: '*** Error:',
  verbose3: 'Setting output as extra verbose with request parsing',
};

async function measure(name, args, { maxMs = 45000 } = {}) {
  const file = path.join(OUT, `${name}.log`);
  const fd = fs.openSync(file, 'w');
  const cmd = pre.length ? pre[0] : bin;
  const argv = pre.length ? [...pre.slice(1), bin, ...args] : args;
  const t0 = Date.now();
  const child = spawn(cmd, argv, { stdio: ['ignore', fd, fd], detached: false });
  fs.closeSync(fd);
  let exitAt = null, exitCode = null, exitSig = null;
  child.on('exit', (c, s) => { exitAt = Date.now() - t0; exitCode = c; exitSig = s; });
  const seen = {};
  while (Date.now() - t0 < maxMs) {
    const txt = fs.readFileSync(file, 'utf8');
    for (const [k, m] of Object.entries(MARKERS)) {
      if (seen[k] == null && (m instanceof RegExp ? m.test(txt) : txt.includes(m))) seen[k] = Date.now() - t0;
    }
    if (seen.success != null && seen.started != null) break;
    if (exitAt != null && Date.now() - t0 > exitAt + 1000) break;
    await sleep(100);
  }
  const txt = fs.readFileSync(file, 'utf8');
  const suiteStopAt = Math.min(...['started', 'json', 'error'].map((k) => seen[k] ?? Infinity), 15000);
  const row = { name, seen_ms: seen, exit_ms: exitAt, exitCode, exitSig, bytes: txt.length, suiteWouldStopAt_ms: suiteStopAt, firstLine: red(txt.split('\n')[0]).slice(0, 120) };
  console.log(JSON.stringify(row));
  return child;
}

const kids = [];
const stop = async (args) => { const c = spawn(pre.length ? pre[0] : bin, pre.length ? [...pre.slice(1), bin, ...args] : args, { stdio: 'ignore' }); await new Promise((r) => c.on('exit', r)); };
try {
  console.log(`[${label}] ${execFileSync(pre.length ? pre[0] : bin, pre.length ? [...pre.slice(1), bin, '--version'] : ['--version']).toString().trim()}`);
  kids.push(await measure('enable-logging-for-api', ['--key', KEY, ...HOST, '--enable-logging-for-api']));
  kids.forEach((k) => { try { k.kill('SIGTERM'); } catch {} }); await sleep(4000);
  kids.push(await measure('tunnelIdentifier', ['--key', KEY, ...HOST, '-tunnelIdentifier', `mk-${label}`]));
  kids.forEach((k) => { try { k.kill('SIGTERM'); } catch {} }); await sleep(4000);
  await measure('verbose3-badkey', ['--key', 'ckajsnc-&*123', ...HOST, '--verbose', '3'], { maxMs: 20000 });
  await sleep(1000);
  await measure('daemon-start-tunnelIdentifier', ['--key', KEY, ...HOST, '-d', 'start', '-tunnelIdentifier', `mkd-${label}`], { maxMs: 60000 });
  await stop(['--key', KEY, ...HOST, '-d', 'stop', '-tunnelIdentifier', `mkd-${label}`]);
  await sleep(3000);
  await measure('v2-daemon-start', ['--key', KEY, ...HOST, '--daemon', 'start'], { maxMs: 60000 });
  await stop(['--key', KEY, ...HOST, '--daemon', 'stop']);
} finally {
  kids.forEach((k) => { try { k.kill('SIGTERM'); } catch {} });
  await sleep(3000);
}
