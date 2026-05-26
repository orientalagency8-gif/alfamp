#!/usr/bin/env node
// bench-hitch.js — count "server thread hitch warning: timer interval of N ms" lines in /var/log/alfaserver.log
// over a window. Hitches are the #1 perceived-quality killer on busy CFX servers.
//
// Usage: ssh root@vps "node bench-hitch.js [logfile=/var/log/alfaserver.log] [windowMin=10]"

const fs = require('node:fs');
const [logArg, winArg] = process.argv.slice(2);
const log = logArg || '/var/log/alfaserver.log';
const windowMin = parseInt(winArg) || 10;

if (!fs.existsSync(log)) { console.error(`Log not found: ${log}`); process.exit(1); }

const text = fs.readFileSync(log, 'utf8');
const lines = text.split('\n');

const cutoff = Date.now() - windowMin * 60 * 1000;
const hitchRegex = /server thread hitch warning: timer interval of (\d+) milliseconds/;
const tsRegex    = /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/;

const hitches = [];
for (const line of lines) {
  const h = line.match(hitchRegex);
  if (!h) continue;
  const t = line.match(tsRegex);
  const ts = t ? new Date(t[1]).getTime() : Date.now();
  if (ts < cutoff) continue;
  hitches.push({ ts, ms: +h[1] });
}

if (hitches.length === 0) {
  console.log(`✅ No hitches in last ${windowMin} min (window covers ${(text.length/1024).toFixed(0)} KB of log).`);
  process.exit(0);
}

hitches.sort((a, b) => b.ms - a.ms);
const total = hitches.length;
const perMin = (total / windowMin).toFixed(2);
const worst3 = hitches.slice(0, 3).map(h => `${h.ms}ms@${new Date(h.ts).toISOString().slice(11,19)}`).join(', ');
const avg = hitches.reduce((s, h) => s + h.ms, 0) / total;

console.log(`Hitches in last ${windowMin} min:`);
console.log(`  count   : ${total}`);
console.log(`  rate    : ${perMin}/min`);
console.log(`  avg ms  : ${avg.toFixed(0)}`);
console.log(`  worst3  : ${worst3}`);

const verdict =
  perMin < 0.1 ? '✅ rock solid' :
  perMin < 1.0 ? '🟢 healthy' :
  perMin < 5.0 ? '🟡 noticeable hitches (investigate)' :
                 '🔴 unstable — check resource scripts for blocking calls';
console.log(`\n  ${verdict}`);
