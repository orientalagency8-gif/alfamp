#!/usr/bin/env node
// bench-latency.js — measure RTT to a server's HTTP endpoint (proxy for game-tick latency).
// We hit /info.json N times, sample timings, report avg/p50/p95/p99/jitter.

const [hostArg, countArg] = process.argv.slice(2);
const host = hostArg || '127.0.0.1:30120';
const count = parseInt(countArg) || 60;

(async () => {
  console.log(`Pinging ${host} ${count} times…`);
  const samples = [];

  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    try {
      await fetch(`http://${host}/info.json`, { signal: AbortSignal.timeout(2000) });
      samples.push(performance.now() - t0);
    } catch { samples.push(null); }
    await new Promise(r => setTimeout(r, 200));
  }

  const ok = samples.filter(x => x !== null).sort((a, b) => a - b);
  const lost = samples.length - ok.length;
  if (ok.length === 0) { console.error('All requests failed'); process.exit(1); }

  const avg = ok.reduce((s, x) => s + x, 0) / ok.length;
  const p50 = ok[Math.floor(ok.length * 0.50)];
  const p95 = ok[Math.floor(ok.length * 0.95)];
  const p99 = ok[Math.floor(ok.length * 0.99)];
  const jitter = ok.length > 1
    ? ok.slice(1).reduce((s, x, i) => s + Math.abs(x - ok[i]), 0) / (ok.length - 1)
    : 0;

  console.log(`\nResults (${ok.length}/${samples.length} ok, ${lost} timeouts):`);
  console.log(`  avg    : ${avg.toFixed(1)} ms`);
  console.log(`  p50    : ${p50.toFixed(1)} ms`);
  console.log(`  p95    : ${p95.toFixed(1)} ms`);
  console.log(`  p99    : ${p99.toFixed(1)} ms`);
  console.log(`  jitter : ${jitter.toFixed(1)} ms (mean abs delta)`);

  const verdict =
    avg < 50  && jitter < 10 ? '✅ excellent (LAN-like)' :
    avg < 100 && jitter < 25 ? '🟢 good (typical RP server feel)' :
    avg < 200 && jitter < 50 ? '🟡 acceptable (laggy but playable)' :
                               '🔴 poor (high latency or congestion)';
  console.log(`\n  ${verdict}`);
})();
