# Netcode improvements — Phase 1 → 2 → 3

This document is the **engineering plan** for outperforming RAGE MP on vehicle sync, hit-reg, and overall feel. It pins every change to specific CitizenFX source files (in upstream `citizenfx/fivem`), since our `patches/` apply on top.

**Status legend**: 🟢 done, 🟡 in progress, 🔴 scaffolded only, ⚪ planned.

---

## Phase 1 — visible improvement over RAGE MP (4-6 weeks)

Goal: an average player notices "huh, this looks smoother" within 30 seconds of joining.

### 1.1 — 60 Hz tickrate ⚪
**Why:** RAGE MP, FiveM, altV-v1 all run 30 Hz by default. 60 Hz halves the perceived staleness of every position update on remote entities. The "rubber band" feeling on fast cars at 100+ ms ping disappears.

**Cost:** ~2× bandwidth (each tick sends snapshot deltas). Modern hostings handle it easily; we keep adaptive priority (§1.4) to balance.

**Where to patch (CFX upstream):**
- `code/components/citizen-server-impl/include/state/ServerGameState.h` — constants `EntitySync_MaxTickrate`, `g_tickrate`
- `code/components/citizen-server-impl/src/state/ServerGameState.cpp` — `ProcessClonesSync()` invokes `OnGameFrame` at fixed cadence; patch the timer source.
- `data/shared/citizen/scripting/lua/scheduler.lua` — `Citizen.Wait(0)` minimum granularity.

**Patch file:** `patches/netcode/01-60hz-tickrate.patch` (scaffolded — see file)

**Quick win without patches:** convars `onesync_distanceCullVehicles` + `onesync_population` + `sv_endpoints_pollInterval` give us ~80% of perceived improvement without recompiling.

---

### 1.2 — Extended vehicle snapshot ⚪
**Why:** Stock OneSync packs `[position(3), rotation(3), velocity(3)]` for vehicles. We add steering input, throttle, brake, gear, RPM. Clients do dead-reckoning (predict where the car *will* be based on inputs+velocity) → no visual catchup jitter between snapshots.

**Where to patch:**
- `code/components/citizen-server-impl/include/state/SyncTrees_Five.h` — `CVehicleGameStateDataNode`, add fields `steerAngle` (q8.7), `throttle` (q8.0), `brake` (q8.0), `gear` (u4), `rpm` (q12.4).
- Same file, `CVehicleAngVelocityDataNode` — already has angular velocity but no rpm.
- Client-side: `code/components/gta-streaming-five/src/StreamingVehicleHandling.cpp` — apply incoming snapshot to vehicle handling state so the wheels actually turn for the input shown.

**Bit budget:** ~28 bits added per snapshot per vehicle. At 60 Hz × 30 nearby cars = 50 kbit/s extra per player. Trivial.

**Patch file:** `patches/netcode/02-extended-vehicle-snapshot.patch` (scaffolded)

---

### 1.3 — Soft reconciliation (no teleports) ⚪
**Why:** When client-side prediction diverges from server-state by more than X meters, stock CFX does a **hard snap** — the entity teleports. Player sees a jolt. Industry standard fix: smoothly **lerp** the entity back over 300-500 ms, then resume.

**Where to patch:**
- `code/components/gta-streaming-five/src/SyncTrees_Five.cpp` — `CVehicleSyncTree::ApplyToObject()`, the "hard reset" branch.
- New helper: `code/components/gta-streaming-five/src/SoftReconciler.cpp` (new file).

**Algorithm (pseudocode):**
```
on receive_snapshot(server_state):
    predicted = our_predicted_state_at(server_state.timestamp)
    delta = predicted.position - server_state.position
    if |delta| > 50m: hard_snap(server_state); return
    if |delta| < 0.05m: ignore (within tolerance)
    else:
        # Smooth correction over the next 500 ms
        reconcile_target = server_state.position
        reconcile_start  = now
        reconcile_duration = 0.5
# in tick:
    if reconciling:
        t = (now - reconcile_start) / reconcile_duration
        if t >= 1: stop reconciling
        else: entity.position = lerp(entity.position, reconcile_target, smoothstep(t))
```

**Patch file:** `patches/netcode/03-soft-reconciliation.patch` (scaffolded)

---

### 1.4 — Adaptive sync priority by distance ⚪
**Why:** Currently all entities in `streaming_distance` (250 m) sync at the same cadence. A car 200 m away does **not** need 60 Hz updates — 5 Hz suffices visually. Switching budget away from far entities lets the close ones (where you actually look) sync faster.

**Where to patch:**
- `code/components/citizen-server-impl/src/state/ServerGameState.cpp` — `OnRequestEntitySetWithoutOwner()` and `OnClonesSync()` — compute per-pair sync rate.

**Priority table (configurable via convars):**
| Distance to nearest viewer | Sync rate |
|----------------------------|-----------|
| ≤ 30 m                     | 60 Hz |
| 30-100 m                   | 30 Hz |
| 100-200 m                  | 10 Hz |
| 200-300 m                  | 3 Hz  |
| > 300 m                    | event-only (creation, destruction, big state change) |

**Quick win:** convar `onesync_distanceCullVehicles true` already does **part** of this (culls very-far vehicles entirely). Our patch adds the in-between tiers.

**Patch file:** `patches/netcode/04-adaptive-priority.patch` (scaffolded)

---

## Phase 2 — competitive advantage (2 months)

Goal: anti-cheat-friendly and reaches **"better than RAGE"** factual claim.

### 2.1 — State-authoritative vehicle sync 🔴
**Why this is the big one:** RAGE MP / FiveM / altV-v1 all use **owner-authoritative** vehicles — the driver's client simulates the physics and broadcasts result. If they lag → everyone sees rubber band. If they cheat → server can't validate.

State-auth flips it: client sends **inputs** (steer, throttle, brake), server runs the physics tick, broadcasts state. All viewers see one consistent simulation.

**Cost:** significant CPU on server (RAGE physics for 30 simultaneous cars ≈ 2-4 cores). Need careful priority budgets.

**Where to patch:**
- `code/components/citizen-server-impl/include/state/StateAuthority.h` (new file) — defines the input packet schema.
- `code/components/citizen-server-impl/src/state/StateAuthority.cpp` (new file) — implements per-tick physics integration. Will reuse the GTA V physics math constants exposed via citizen-mod-loader.
- `code/components/gta-streaming-five/src/StreamingVehicleHandling.cpp` — client-side: stop simulating, just send inputs + interpolate broadcasted state.
- New convar `sv_authoritative_vehicles` (default false in beta, true post-stabilization).

**Patch file:** `patches/netcode/10-state-auth-vehicle.patch` (skeleton only — multi-week work)

---

### 2.2 — Driver handoff protocol 🔴
**Why:** When player A exits vehicle → AI/player B enters → ownership transfer often produces a visible glitch (vehicle "stops", repositions slightly, sometimes loses orientation).

**Fix:** atomic CAS-style ownership transfer:
1. Server sees `exitVehicle(A)` event.
2. Server locks vehicle state at exact frame.
3. Server elects next owner (B, or AI).
4. Server broadcasts atomic `[handoff: oldOwner=A, newOwner=B, state=…]`.
5. Both clients reconcile in one frame.

**Where to patch:**
- `code/components/citizen-server-impl/src/state/ServerGameState.cpp` — `MoveEntityToCandidate()` already does this badly; replace with the atomic protocol.

**Patch file:** `patches/netcode/11-driver-handoff.patch` (skeleton)

---

### 2.3 — Server-side rewind (lag-comp hits) 🔴
**Why:** In all GTA-MP frameworks, when you shoot, the server checks if the bullet hit at server's current time. By then the target has moved (round-trip latency). Half your bullets miss "for no reason". This is the #1 gunplay complaint on every RAGE/FiveM RP server.

**Fix (industry standard, used in CS:GO/Apex/Valorant):**
- Server keeps a 500 ms ring-buffer of each player's hitbox positions.
- On hit-event from shooter, server rewinds world to `(server_time - shooter_rtt/2)`.
- Performs hit test there.
- Restores world.
- Awards hit if it lands.

**Where to patch:**
- New: `code/components/citizen-server-impl/src/state/HitRewind.cpp`
- Patch existing hit-event handler in `code/components/extra-natives-five/src/HitTracking.cpp`

**Bit budget:** ring buffer ~32 bytes/player × 30 ticks × 32 players = ~30 KB RAM. Trivial.

**Patch file:** `patches/netcode/12-server-rewind.patch` (skeleton)

---

### 2.4 — Collision arbitration 🔴
**Why:** Two players ram each other at 200 km/h. Currently each client simulates the collision locally; outcomes differ (one sees A bounce off, other sees both crumple). Server is the tie-breaker.

**Algorithm:**
1. Both clients send their pre-collision state to server.
2. Server runs collision physics once with the more-recent data.
3. Server broadcasts authoritative post-collision state (positions, velocities, damage).
4. Both clients snap (or soft-lerp) to that state.

**Where to patch:**
- New: `code/components/citizen-server-impl/src/state/CollisionArbiter.cpp`
- Patch: `code/components/extra-natives-five/src/CollisionTracking.cpp`

**Patch file:** `patches/netcode/13-collision-arbitration.patch` (skeleton)

---

## Phase 3 — operational maturity (4-6 weeks, parallel)

### 3.1 — Hot-reload SDK ⚪
File-watcher on `resources/*/server/` + automatic resource restart on save. Already partially in CFX `restart` command — we add the file-watch wrapper as a small standalone resource.

**Patch:** none — pure resource: `compat-rage/resources/alfa-hotreload/`

---

### 3.2 — Telemetry (self-hosted Sentry) ⚪
Anonymous crash/perf reports flow back to us for product-side decisions. Hosters can opt-in to share gameplay metrics (FPS, packet loss, hitch rate).

**Setup:** Sentry self-hosted via Docker compose on our VPS, public DSN. Patches in client and server emit events.

**Where to patch:**
- Client: `code/client/launcher/CitiLaunch.cpp` — Sentry init.
- Server: `code/server/launcher/Launcher.cpp` — Sentry init.

---

### 3.3 — Anti-cheat v2 ⚪
Phase 1 (movement+spawn+HWID) ships in `compat-rage/resources/alfa-anticheat`. Phase 2 adds:
- Memory-section hash integrity (client-side, reported to server periodically)
- Behavior heuristics: aim snap detection, impossible-tracking-through-walls
- HWID rotation detection (different HWID on same Steam acct = suspicious)
- Optional kernel-level future (with strong opt-in only)

---

## Quick wins you can apply **today** (no patches)

These convars exist in upstream CFX and tune what we already have:

```cfg
# In server.cfg — already in our hardened config:
onesync on
onesync_population true
onesync_workaround763185 1

# NEW — add these for Phase 1 quick gains:
onesync_distanceCullVehicles true     # cull cars > 300m
sv_authMaxVariance 1                  # tighter identity check
sv_authMinTrust 5                     # require somewhat-trusted client
sv_endpoint_private 0                 # public endpoints
sv_pureLevel 2                        # max anti-mod (already set)

# Bandwidth-side:
sv_listingIpOverride ""               # don't proxy heartbeat through Cfx (we don't anyway)
```

`alfa_ac_*` convars from our `alfa-anticheat` are also tunable:
```cfg
set alfa_ac_maxSpeed 100              # m/s — increase if you ship fast cars in mods
set alfa_ac_vehLimit 30                # vehicle spawns per minute per player
set alfa_ac_webhook https://...        # Discord webhook for kick reports
```

---

## Measurement: how we know it's actually better

The improvements above are meaningless without benchmarks. We ship `tools/netcode-bench/`:

| Metric | How measured | Target vs RAGE/FiveM stock |
|--------|--------------|---------------------------|
| Tickrate (actual) | `bench-tickrate.js` polls server `/info.json` 10× per s | 60.0 ± 0.5 Hz |
| Latency (RTT) | `bench-latency.js` — UDP ping flood | < 1 Hz jitter at 60ms RTT |
| Visual jitter (% of frames with > 5cm correction) | client-side instrumentation patch | < 2% (RAGE typical ≈ 15%) |
| Hit-reg accuracy | `bench-hitreg.js` — bots shoot moving targets, server logs hits-vs-shots | > 95% at 60ms RTT (RAGE ≈ 60%) |
| Bandwidth | nethogs on AlfaServer | < 12 KB/s/player avg (RAGE ≈ 8 KB/s but 30 Hz) |
| Hitch warnings | parse `server thread hitch warning` from log | < 0.1/min on 32-player server |

Bench scripts live in `tools/netcode-bench/`.

---

## Calendar

| Week | Deliverable |
|------|-------------|
| 1-2  | Phase 1 quick wins (convars), benchmarks live, baseline numbers |
| 3-4  | 60 Hz tickrate patch (riskiest part of Phase 1) |
| 5-6  | Extended snapshot + soft reconciliation |
| 7-8  | Adaptive priority + Phase 1 wrap, release notes |
| 9-12 | Phase 2.1 state-authoritative vehicle (most R&D) |
| 13-14| Phase 2.2 driver handoff |
| 15-16| Phase 2.3 server rewind |
| 17-18| Phase 2.4 collision arbitration |
| 19-20| Hot-reload, telemetry, AC v2 |
| 21+  | Soak testing, public beta with first real partner servers |
