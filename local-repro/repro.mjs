// Behaviour check for two BrowserStackLocal builds on the same host:
//   #2  a second `-d start` while a daemon runs: expected to print the bsErrorCode 1001 JSON
//   #3  a second tunnel with a different --local-identifier / --force kills the first
// Usage: node repro.mjs <label> <binary> [arch-prefix e.g. "arch -x86_64"]
// Targets preprod by default (BSL_BS_HOST to override); key from BSL_KEY, redacted from all output. SIGTERM only.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [label, bin, archPrefix] = process.argv.slice(2);
if (!label || !bin) { console.error('usage: node repro.mjs <label> <binary> [arch-prefix]'); process.exit(2); }
// Key: BSL_KEY env. Host: BSL_BS_HOST (default preprod).
// BSL_BS_HOST=prod -> no --bs-host (production); unset -> preprod.
const env = { bsHost: process.env.BSL_BS_HOST || 'preprod-local-service.bsstag.com' };
const KEY = process.env.BSL_KEY;
if (!KEY) { console.error('set BSL_KEY'); process.exit(2); }
const red = (s) => String(s).split(KEY).join('<KEY>');
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), `out-${label}`);
fs.mkdirSync(OUT, { recursive: true });

const pre = archPrefix ? archPrefix.split(' ') : [];
// FLAGS=old -> single-dash legacy flags (-localIdentifier / -force), as in the regression report.
const OLD = process.env.FLAGS === 'old';
const ID = OLD ? '-localIdentifier' : '--local-identifier';
const FORCE = OLD ? '-force' : '--force';
const base = env.bsHost === 'prod' ? ['--key', KEY] : ['--key', KEY, '--bs-host', env.bsHost];
const children = [];

function run(name, args, { waitConnected = false, timeoutMs = 90000 } = {}) {
  const cmd = pre.length ? pre[0] : bin;
  const argv = pre.length ? [...pre.slice(1), bin, ...args] : args;
  const child = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let buf = '';
  const log = fs.createWriteStream(path.join(OUT, `${name}.log`));
  const onData = (d) => { buf += d; log.write(red(d)); };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  const exited = new Promise((r) => child.on('exit', (code, signal) => { log.end(); r({ code, signal }); }));
  const ready = new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (/You can now access your local server|Press Ctrl-C to exit/.test(buf)) { clearInterval(iv); resolve('connected'); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); resolve('timeout'); }
    }, 250);
    exited.then(() => { clearInterval(iv); resolve('exited'); });
  });
  return { name, child, ready, exited, out: () => red(buf).trim() };
}
const alive = (p) => { try { process.kill(p.child.pid, 0); return p.child.exitCode === null && p.child.signalCode === null; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function stopAll() {
  for (const c of children) if (c.exitCode === null && c.signalCode === null) { try { c.kill('SIGTERM'); } catch {} }
  await sleep(4000);
}
const ps = () => red(execSync("ps -eo pid,ppid,args | grep '[B]rowserStackLocal' | grep -v 'node repro' || true").toString()).trim();
const result = { label, bin, version: null };

try {
  result.version = execSync([...pre, bin, '--version'].join(' ')).toString().trim();
  console.log(`[${label}] ${result.version}`);

  // ---- #2: second daemon start ----------------------------------------------------
  const d1 = run('d1-start', [...base, '-d', 'start'], { timeoutMs: 120000 });
  const d1x = await d1.exited;
  console.log(`[${label}] #2 first  -d start: exit=${d1x.code} signal=${d1x.signal}\n  ${d1.out().replace(/\n/g, '\n  ')}`);
  const d2 = run('d2-start', [...base, '-d', 'start'], { timeoutMs: 120000 });
  const d2x = await d2.exited;
  result.daemon2 = { exit: d2x.code, signal: d2x.signal, out: d2.out() };
  console.log(`[${label}] #2 second -d start: exit=${d2x.code} signal=${d2x.signal} output=${JSON.stringify(d2.out())}`);
  console.log(`[${label}] processes after #2:\n${ps()}`);
  const ds = run('d-stop', [...base, '-d', 'stop']);
  const dsx = await ds.exited;
  console.log(`[${label}] -d stop: exit=${dsx.code} ${JSON.stringify(ds.out())}`);
  await sleep(3000);

  // ---- #3a: second tunnel, different identifier, no --force -----------------------
  const abc = run('3a-abc', [...base, ID, `repro-abc-${label}`]);
  console.log(`[${label}] #3a abc: ${await abc.ready}`);
  const def = run('3a-def', [...base, ID, `repro-def-${label}`]);
  console.log(`[${label}] #3a def: ${await def.ready}`);
  await sleep(15000);
  result.t3a = { abcAlive: alive(abc), defAlive: alive(def) };
  console.log(`[${label}] #3a after 15s: abc alive=${alive(abc)} def alive=${alive(def)}`);
  console.log(`[${label}] processes:\n${ps()}`);

  // ---- #3b: --force with identifier abc while abc and def run ----------------------
  if (!alive(abc) || !alive(def)) console.log(`[${label}] #3b skipped: abc/def not both running`);
  else {
    const abc2 = run('3b-abc-force', [...base, ID, `repro-abc-${label}`, FORCE]);
    console.log(`[${label}] #3b new abc --force: ${await abc2.ready}`);
    await sleep(10000);
    result.t3b = { oldAbcAlive: alive(abc), defAlive: alive(def), newAbcAlive: alive(abc2) };
    console.log(`[${label}] #3b: old abc alive=${alive(abc)} def alive=${alive(def)} new abc alive=${alive(abc2)}`);
    console.log(`[${label}] processes:\n${ps()}`);
  }
} finally {
  await stopAll();
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  console.log(`[${label}] leftover processes:\n${ps() || '(none)'}`);
}
