# How an Alfa MP server starts, registers, and serves clients

Side-by-side with RAGE MP so a hoster migrating from RAGE knows exactly what's different (and what isn't).

## 1. Side-by-side startup matrix

| Step | RAGE MP | Alfa MP | Same / Different |
|------|---------|---------|------------------|
| **Entry binary** | `ragemp-server.exe` (Win) / `./ragemp-server` (Linux) | `run.sh` → `FXServer` (Linux) | Different name, same role |
| **Config file** | `conf.json` (JSON) | `server.cfg` (CFX config syntax — like CS source-engine) | Different format, more expressive |
| **Ports default** | UDP **22005** (game) + TCP **22006** (HTTP file server) | TCP+UDP **30120** (one port, multiplexed: HTTP+files+game) | We're cleaner — single port |
| **Server scripts location** | `packages/<resource>/index.js` (JS) or `packages/<resource>/<dll>` (C#) | `resources/<resource>/server/*.{js,cs,dll}` | Same idea, slightly different layout |
| **Client scripts location** | `client_packages/<resource>/index.js` | `resources/<resource>/client/*.js` | Auto-streamed to clients on connect |
| **Streamed assets (DLC, maps)** | `client_packages/maps/*.ymap` etc., loaded via custom IPL loader | `resources/<resource>/stream/**/*` — engine streams automatically | We don't need a custom loader; just drop into `stream/` |
| **Loading screen** | RAGE built-in (plain) | Custom resource `alfa-loading-screen` (HTML+CSS with progress, resource list, tips) | We ship a nicer one |
| **Heartbeat target** | `master.ragemp.com` (Cfx-style protocol) | `http://master.alfamp.gg/v1/servers/heartbeat` (our master) | Same concept; we own the master |
| **License check** | RAGE MP key system | **None** (svadhesive removed) | We removed the gate |
| **Resource hot-reload** | restart whole resource (`restart <name>`) | `restart <name>` + auto-detection of file changes (dev mode) | Same baseline, dev mode optional |

## 2. Full Alfa MP startup flow (annotated)

```
                ┌──────────────────────────┐
1. Hoster runs  │ screen -dmS alfaserver \ │
                │   /opt/alfaserver/       │
                │     server/run.sh        │
                │     +exec server.cfg     │
                └──────┬───────────────────┘
                       │
                       ▼
2. run.sh exec's       FXServer binary (alpine musl libc, statically linked)
                       with citizen_dir pointing at /opt/alfaserver/server/alpine/opt/cfx-server/citizen/

                       ┌──────────────────────────────────────┐
3. FXServer:           │ a. Read components.json              │ ← (we deleted "svadhesive" from this list,
                       │ b. dlopen each lib*.so component     │    bypassing license-key check)
                       │ c. Init core systems                 │
                       │   - network (mtl/enet)               │
                       │   - resources scanner                │
                       │   - scripting runtimes (lua/v8/mono) │
                       │   - http server (info.json/players)  │
                       └──────────────────────────────────────┘
                       │
                       ▼
4. server.cfg          ┌─ endpoint_add_tcp "0.0.0.0:30120"   ─┐ Binds 30120 TCP for HTTP & file serving
   processed:          │  endpoint_add_udp "0.0.0.0:30120"    │ Binds 30120 UDP for game traffic
                       │  sv_hostname "..."                   │ Display name in master + launcher
                       │  sv_maxclients 64                    │ Player cap
                       │  sv_master1 ""                       │ Disable Cfx.re public master (we use ours)
                       │  onesync on                          │ State-authoritative entity sync
                       │  sv_pureLevel 2                      │ Block client-side mods (anti-cheat)
                       │  sv_enforceGameBuild 3258            │ Pin GTA build (anti-spoof)
                       │  ensure mapmanager                   │ Start each named resource:
                       │  ensure chat                         │   → scan resources/<name>/fxmanifest.lua
                       │  ensure alfa-loading-screen          │   → start scripting environments
                       │  ensure alfa-voice-shim              │   → mount client_scripts for streaming
                       │  ensure alfa-anticheat               │   → start server_scripts
                       └──────────────────────────────────────┘
                       │
                       ▼
5. Heartbeat:          On a 20-s timer (we ship a systemd-timer), the hoster's box POSTs to OUR master:
                       POST http://master.alfamp.gg/v1/servers/heartbeat
                            { serverId, apiKey, players }
                       → master updates last_heartbeat, recomputes "alive" servers, exposes
                         via GET /v1/servers — launcher polls this every 30 s.

                       ┌─────────────────────────────────────────────────┐
6. Player connects:    │ Client (AlfaMP.exe) talks to UDP/30120          │
                       │  ── Phase 1: protocol handshake                 │
                       │     • DTLS-ish encrypted UDP                    │
                       │     • version-check (alfamp/3, gameBuild 3258)  │
                       │     • session-token validated (master pubkey)   │
                       │     • HWID checked against banlist              │
                       │  ── Phase 2: resource manifest sync             │
                       │     • Server sends list of resources + sha256s  │
                       │     • Client downloads missing files via TCP    │
                       │     • alfa-loading-screen shows live progress   │
                       │  ── Phase 3: spawn                              │
                       │     • spawnmanager picks spawn coords           │
                       │     • Player ped created, OneSync entity        │
                       │     • basic-gamemode says "Welcome"             │
                       └─────────────────────────────────────────────────┘
```

## 3. What gets downloaded to the player (and how)

```
Player connects → Server replies with manifest:

  Resource              Files in stream/        Files in client/    Size
  ────────              ────────────────        ────────────────    ────
  spawnmanager          —                       spawnmanager.js     12 KB
  chat                  —                       html/* + js/*       80 KB
  alfa-loading-screen   —                       (loadscreen only)   30 KB
  my-custom-interior    apartment.ymap          —                   850 KB
                        apartment.ytyp                              140 KB
                        apartment_lod.ydr                          1.2 MB
                        apartment.ytd                              640 KB
  my-rp-cars            pack1.yft × 50                              250 MB
                        pack1.ytd × 50                              180 MB

Client checks local cache (%LocalAppData%\AlfaMP\cache\<serverId>\<sha256>):
  • Match → skip
  • Miss  → fetch via TCP/30120 (or hoster's CDN if resource_cdn_url set)

alfa-loading-screen shows for the duration:
  • Progress bar (% bytes downloaded)
  • Current file name
  • ETA at current network speed
  • Tips (rotating)
```

## 4. Ports — exactly what to open in firewall

```
On the hoster's VPS:

  ufw allow 30120/tcp     # game HTTP + file streaming
  ufw allow 30120/udp     # game UDP (player connections, RPC)
  ufw allow OpenSSH

# Optionally if behind nginx for TLS termination later:
  ufw allow 443/tcp
```

**No additional ports needed.** RAGE MP forced you to open 22005+22006; we use one port (30120) multiplexed.

## 5. How a server "becomes visible in the launcher"

```
1. Hoster sets up AlfaServer (see /docs/MIGRATION-FROM-RAGE.md → "Installing AlfaServer")
2. Admin or hoster registers in master:
   POST /v1/servers/register → returns { id, apiKey }
3. Hoster's heartbeat timer starts pinging /v1/servers/heartbeat every 20 s
4. Launcher polls /v1/servers every 30 s; server now visible to all players
5. Player double-clicks server row → launcher launches AlfaMP.exe with fivem://connect/IP:30120
6. AlfaMP.exe handshakes, downloads resources, spawns. Player plays.
```

End-to-end: register → first player joins = **under 1 minute** if everything's pre-installed.

## 6. Hoster's daily life — what they actually do

```bash
# Update server-side resource code
cd /opt/alfaserver/server-data/resources/my-rp
git pull
# Reload just that resource (no full restart, no player disconnects)
echo 'restart my-rp' | screen -S alfaserver -X stuff $'\015'

# Check status
curl http://127.0.0.1:30120/info.json | jq .

# View logs
tail -f /var/log/alfaserver.log

# Restart whole server (preserves player session via reconnect)
systemctl restart alfaserver
```

## 7. Differences that matter for migrating RAGE servers

| Concern | RAGE MP | Alfa MP | How to migrate |
|---------|---------|---------|----------------|
| HTTP file server | TCP 22006, separate | TCP 30120, same port | No action — automatic |
| `conf.json` parsing | RAGE-specific | Alfa server.cfg | `alfa-migrate.py` converts |
| `packages/` layout | flat per-resource | `resources/<name>/{server,client,stream,html}/` | `alfa-migrate.py` reshapes |
| Custom client UI (CEF) | `mp.Browser('package://...')` | NUI iframe in our overlay (same Chromium) | Our client-shim translates calls |
| Streaming assets | `client_packages/maps/` + custom IPL | `resources/<r>/stream/*.ymap` | `alfa-migrate.py` copies |
| Database libraries | `mysql`, `mongodb`, `mssql` NPM packages | Same NPM packages — no changes | Drop-in |
| Custom natives | `mp.game.invoke('NAME', args)` | `mp.game.invoke('NAME' or '0xHASH', args)` | Our shim has ~60 names, rest = 0xHASH |

## 8. Differences from a player's perspective (≈ "what they see")

| Step | RAGE MP feel | Alfa MP feel |
|------|--------------|--------------|
| Open launcher | Plain server browser, no animation | **Splash screen** (2.5 s pulse-logo + progress bar) → main UI |
| Server browser | Tabs, search, server list | **Identical UX** — we copied the RAGE layout, dark theme, flags, ping bars |
| Click Connect | "Connecting..." dialog | Same dialog (FiveM fallback now; AlfaMP.exe when build #10 finishes) |
| In-game loading | Plain "Loading…" with random GTA loading screen | **Pretty** alfa-loading-screen: brand, progress bar, resource list, rotating tips |
| First spawn | Falls from sky | Same (basic-gamemode default) — hoster can override |
| Voice chat | RAGE proximity voice | Mumble-backed proximity via `alfa-voice-shim` (configurable radius) |
| Cheaters | "Eventually banned" | **Server-side movement validation kicks in seconds** — speedhack / teleport / spawn-spam detected automatically |
