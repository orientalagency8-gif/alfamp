# netcode-bench

Tiny measurement scripts so improvements over time are **measured, not felt**.
All written in plain Node 20+ — zero deps.

## Scripts

| Script | What it measures | How |
|--------|------------------|-----|
| `bench-tickrate.js` | Actual server tickrate (Hz) | Polls `/info.json`'s `version` field and computes deltas |
| `bench-latency.js` | HTTP RTT to game server (proxy for game-tick latency) | 60 fetches with timings, avg/p50/p95/p99/jitter |
| `bench-hitch.js` | "server thread hitch warning" rate from server log | Parses `/var/log/alfaserver.log` over a window |

## Use

```bash
# Tickrate of our live server
node bench-tickrate.js 104.194.140.221:30120 30

# RTT
node bench-latency.js 104.194.140.221:30120 60

# Hitches over last 30 min (run on the VPS itself):
ssh root@104.194.140.221 "cd /opt/alfaserver && node bench-hitch.js /var/log/alfaserver.log 30"
```

## Baselines we'll track

| Metric | Stock FXServer / RAGE baseline | Alfa Phase 1 target | Alfa Phase 2 target |
|--------|--------------------------------|---------------------|---------------------|
| Tickrate avg | 30 Hz | **60 Hz** | 60 Hz |
| RTT jitter (LAN) | 20 ms | < 8 ms | < 5 ms |
| Hitches per minute on 32-player srv | 1-5 | < 1 | < 0.1 |
| Visual jitter % | 10-20% of frames | < 5% | < 1% |
| Hit registration accuracy @ 60 ms RTT | ~60% | ~70% (extended snapshot) | **~92%** (server rewind) |

Numbers above 30 Hz / 60% accuracy are the "feel barrier" — players notice the
difference. Hence the focus.

## Sample output

```
$ node bench-tickrate.js 104.194.140.221:30120 30
Measuring tickrate of 104.194.140.221:30120 for 30s …

Results over 142 samples:
  avg : 29.94 Hz
  p50 : 30.02 Hz
  p95 : 30.41 Hz
  min : 29.20 Hz
  max : 31.05 Hz

  🟡 30 Hz baseline (Phase 1 60 Hz patch not active)
```
