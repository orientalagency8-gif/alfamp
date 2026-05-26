#!/usr/bin/env node
// bench-tickrate.js — measures the actual tickrate of an AlfaServer by polling
// its /info.json `version` field (which increments per tick) for N seconds.
//
// Usage: node bench-tickrate.js [host:port] [duration_sec]
// Example: node bench-tickrate.js 104.194.140.221:30120 30

const [hostArg, durArg] = process.argv.slice(2);
const host = hostArg || '127.0.0.1:30120';
const durationSec = parseInt(durArg) || 30;

const samples = [];
let lastVersion = null, lastT = null;

async function poll() {
  try {
    const r = await fetch(`http://${host}/info.json`, { signal: AbortSignal.timeout(2000) });
    const d = await r.json();
    const t = Date.now();
    const v = d.version;
    if (lastVersion != null && t > lastT) {
      const dv = v - lastVersion, dt = (t - lastT) / 1000;
      if (dv > 0 && dt > 0) samples.push(dv / dt);
    }
    lastVersion = v;
    lastT = t;
  } catch (e) { console.error('  poll error:', e.message); }
}

(async () => {
  console.log(`Measuring tickrate of ${host} for ${durationSec}s …`);
  const startT = Date.now();
  while (Date.now() - startT < durationSec * 1000) {
    await poll();
    await new Promise(r => setTimeout(r, 200));  // 5 Hz polling
  }

  if (samples.length === 0) {
    console.error('No samples — is /info.json reachable?');
    process.exit(1);
  }

  samples.sort((a, b) => a - b);
  const avg = samples.reduce((s, x) => s + x, 0) / samples.length;
  const p50 = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  const min = samples[0], max = samples[samples.length - 1];

  console.log(`\nResults over ${samples.length} samples:`);
  console.log(`  avg : ${avg.toFixed(2)} Hz`);
  console.log(`  p50 : ${p50.toFixed(2)} Hz`);
  console.log(`  p95 : ${p95.toFixed(2)} Hz`);
  console.log(`  min : ${min.toFixed(2)} Hz`);
  console.log(`  max : ${max.toFixed(2)} Hz`);

  if (avg >= 55) console.log('\n  ✅ 60 Hz target met');
  else if (avg >= 28) console.log('\n  🟡 30 Hz baseline (Phase 1 60 Hz patch not active)');
  else console.log('\n  🔴 Below 28 Hz — server overloaded?');
})();
