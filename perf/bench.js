// Local, offline benchmark for comparing Node builds for an embedded app.
// Usage: <node> bench.js            -> prints one JSON line of results
// Every test is sized to take ~1-3 s on an M2 with a full-JIT Node.
// Compare builds on the same machine; numbers are only comparable within one run.
'use strict';
const net = require('net');
const tls = require('tls');
const vm = require('vm');
const path = require('path');
const { spawnSync } = require('child_process');

const now = () => Number(process.hrtime.bigint()) / 1e6; // ms
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

// --- startup: fresh process doing nothing (fork cost) --------------------------
function startup() {
  const t = [];
  for (let i = 0; i < 7; i++) {
    const s = now();
    spawnSync(process.execPath, ['-e', '0']);
    t.push(now() - s);
  }
  return +median(t).toFixed(1);
}

// --- pipe throughput through a local TCP (or TLS) server, echo-free sink ------
function pipeThroughput(useTls, totalMB) {
  return new Promise((resolve, reject) => {
    // TLS-PSK: same OpenSSL record/AES-GCM path as a TLS-forwarding app, no key/cert files.
    const psk = Buffer.alloc(32, 0x5a);
    const pskOpts = { ciphers: 'PSK-AES128-GCM-SHA256', minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' };
    let received = 0;
    const total = totalMB * 1024 * 1024;
    let start;
    const onConn = (sock) => {
      sock.on('data', (d) => {
        received += d.length;
        if (received >= total) {
          const ms = now() - start;
          sock.destroy();
          server.close();
          resolve(+((totalMB / ms) * 1000).toFixed(1)); // MB/s
        }
      });
    };
    const server = useTls
      ? tls.createServer(Object.assign({ pskCallback: () => psk }, pskOpts), onConn)
      : net.createServer(onConn);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const chunk = Buffer.alloc(64 * 1024, 7);
      const client = useTls
        // PSK authenticates both ends; there is no certificate for a hostname check.
        ? tls.connect(Object.assign({ port, host: '127.0.0.1', pskCallback: () => ({ psk, identity: 'bench' }), checkServerIdentity: () => undefined }, pskOpts))
        : net.connect(port, '127.0.0.1');
      const go = () => {
        start = now();
        let sent = 0;
        const pump = () => {
          while (sent < total) {
            sent += chunk.length;
            if (!client.write(chunk)) { client.once('drain', pump); return; }
          }
        };
        pump();
      };
      client.on(useTls ? 'secureConnect' : 'connect', go);
      client.on('error', (e) => { if (received < total) reject(e); });
    });
    server.on('error', reject);
    server.on('tlsClientError', reject);
    setTimeout(() => reject(new Error((useTls ? 'tls' : 'tcp') + ' throughput timed out')), 60000).unref();
  });
}

// --- WebSocket-style frame masking (pure JS, JIT-bound: the ws hot loop) --------
function wsMask() {
  const buf = Buffer.alloc(16 * 1024);
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const iters = 20000; // 320 MB masked
  const s = now();
  for (let n = 0; n < iters; n++) {
    for (let i = 0; i < buf.length; i++) buf[i] ^= mask[i & 3];
  }
  return +((iters * buf.length / 1048576) / ((now() - s) / 1000)).toFixed(1); // MB/s
}

// --- PAC evaluation via vm (FindProxyForURL in a sandbox) -----------------------
function pac() {
  const src = `
    function dnsDomainIs(h, d){ return h.length >= d.length && h.substring(h.length - d.length) === d; }
    function shExpMatch(s, p){ return new RegExp('^' + p.replace(/\\./g,'\\\\.').replace(/\\*/g,'.*') + '$').test(s); }
    function FindProxyForURL(url, host) {
      if (dnsDomainIs(host, '.internal.example.com') || shExpMatch(host, '10.*')) return 'DIRECT';
      if (shExpMatch(url, 'https://*.app.example.com/*')) return 'PROXY proxy.corp:8080';
      return 'PROXY proxy.corp:3128; DIRECT';
    }`;
  const ctx = vm.createContext(Object.create(null));
  vm.runInContext(src, ctx);
  const fn = vm.runInContext('FindProxyForURL', ctx);
  const iters = 300000;
  const s = now();
  for (let i = 0; i < iters; i++) fn('https://app' + (i % 50) + '.app.example.com/p?q=' + i, 'app' + (i % 50) + '.app.example.com');
  return Math.round(iters / ((now() - s) / 1000)); // calls/s
}

// --- JSON round-trips (control-channel messages) --------------------------------
function json() {
  const msg = { type: 'data', ref: 12345, peer: 'peer-001.example.com', headers: { a: 'b'.repeat(40), c: [1, 2, 3, 4, 5] }, payload: 'x'.repeat(512) };
  const iters = 400000;
  const s = now();
  for (let i = 0; i < iters; i++) { msg.ref = i; JSON.parse(JSON.stringify(msg)); }
  return Math.round(iters / ((now() - s) / 1000)); // round-trips/s
}

(async () => {
  const r = { node: process.version, execPath: path.basename(process.execPath) };
  r.startup_ms = startup();
  r.tcp_MBps = await pipeThroughput(false, 2048);
  r.tls_MBps = await pipeThroughput(true, 1024);
  r.wsmask_MBps = wsMask();
  r.pac_calls_s = pac();
  r.json_rt_s = json();
  console.log(JSON.stringify(r));
  process.exit(0);
})().catch((e) => { console.log(JSON.stringify({ node: process.version, error: e.message })); process.exit(1); });
