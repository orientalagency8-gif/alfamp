# Architecture

High-level component map of Alfa MP. For business plan + non-technical roadmap see **[MASTER-PLAN.md](./MASTER-PLAN.md)**.

## 1. Components

```
┌───────────────────────── PLAYER MACHINE ─────────────────────────┐
│                                                                   │
│   ┌────────────────────┐         ┌────────────────────────────┐  │
│   │  Alfa MP Launcher  │ ──URI──►│  AlfaMP.exe  (game client) │  │
│   │  (Tauri + React)   │         │  (CitizenFX fork + patches)│  │
│   │                    │         │                            │  │
│   │  • Server browser  │         │  • Hooks GTA V process     │  │
│   │  • Auto-updater    │         │  • OneSync (state-sync)    │  │
│   │  • Profile/settings│         │  • DTLS encrypted UDP      │  │
│   │  • News feed       │         │  • Version handshake       │  │
│   └────────┬───────────┘         └────────┬───────────────────┘  │
│            │ HTTPS                         │ DTLS+UDP            │
└────────────│─────────────────────────────┬─│────────────────────┘
             │                             │ │
             │                       ┌─────│─┴────────────────────┐
             │                       │     │   ANY ALFASERVER     │
             │                       │     │  (hosted by anyone)  │
             │                       │     ▼                      │
             │                       │  ┌────────────────────┐    │
             │                       │  │  AlfaServer        │    │
             │                       │  │  (FXServer fork    │    │
             │                       │  │   with patches)    │    │
             │                       │  │                    │    │
             │                       │  │  • Game loop       │    │
             │                       │  │  • Resources       │    │
             │                       │  │   (Lua/JS/C#)      │    │
             │                       │  │  • RAGE compat lyr │    │
             │                       │  └─────┬──────────────┘    │
             │                       │        │ heartbeat (mTLS)  │
             │                       └────────│───────────────────┘
             ▼                                ▼
┌──────────────── OUR INFRA (currently single VPS) ─────────────────┐
│                                                                    │
│  nginx (TLS termination, HTTPS proxy)                              │
│   │                                                                │
│   ├─► master-server  (Fastify + TypeScript, port 8080)             │
│   │     • GET  /v1/servers           — public server list          │
│   │     • POST /v1/servers/register  — hosters register theirs     │
│   │     • POST /v1/servers/heartbeat — keep-alive                  │
│   │     • POST /v1/auth/{register,login,refresh,logout}            │
│   │     • GET  /v1/me                — current user                │
│   │     • GET  /v1/version-manifest  — min launcher/client/proto  │
│   │     • GET  /download             — landing page + redirects   │
│   │                                                                │
│   ├─► PostgreSQL 16   (users, servers, sessions, audit-log)        │
│   ├─► Redis 7         (refresh-token cache, rate-limit buckets)    │
│   │                                                                │
│   └─► AlfaServer (test instance, port 30120) — our reference srv  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## 2. Communication protocols

| From → To | Channel | Encryption | Auth | Notes |
|-----------|---------|------------|------|-------|
| Launcher → master | HTTPS (TLS 1.3) | TLS_AES_256_GCM or ChaCha20-Poly1305 | JWT RS256 (Bearer header) | rate-limited 300 req/min per IP |
| Launcher → AlfaMP.exe | local `fivem://` URI | n/a (local IPC) | n/a | launcher hands off server address |
| AlfaMP.exe → AlfaServer | DTLS 1.3 over UDP/30120 | ChaCha20-Poly1305 + key rotation 5 min | Session token signed by master, validated by server-side public key | nonce+timestamp anti-replay |
| AlfaServer → master | HTTPS (mTLS) | TLS 1.3 | mTLS client cert + API key | heartbeat 20s, register-once |
| Master → AlfaServer | n/a | — | — | master is read-only consumer; doesn't push |
| Auto-updater → CDN | HTTPS | TLS 1.3 | none (public) | update package signature verified before install |

## 3. Identity model

```
              ┌──────────────────────┐
              │  master-server       │
              │  - private RSA key   │ (issues + signs JWTs)
              │  - public RSA key    │ (verifies)
              └──────────┬───────────┘
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────┐      ┌──────────┐       ┌──────────┐
│ Launcher │      │AlfaServer│       │AlfaMP.exe│
│ holds:   │      │ verifies │       │ holds:   │
│ - login  │      │ token via│       │ - session│
│ - refresh│      │ master's │       │   token  │
│   token  │      │ pubkey   │       │ - Ed25519│
│ - HWID   │      │  (cached)│       │   id key │
└──────────┘      └──────────┘       └──────────┘
```

Identity-binding: every session-token is bound to **(user_id, HWID, IP-range)**. Stealing a token off one machine is useless on another — server rejects mismatched HWID.

## 4. Versioning protocol (version handshake)

Every connection step **starts with a version check**. Any mismatch → reject with a precise error so the user knows whether to upgrade launcher / client / wait for server update.

```
[1] Launcher boot
     └─ GET /v1/version-manifest
            ◄── { launcher_min, client_min, protocol_min, gamefiles_hash, channel:"stable|beta" }
     └─ if (own_version < launcher_min): force auto-update before allowing Connect

[2] Launcher → AlfaMP.exe
     └─ passes Connect URL + session_token + protocol_version

[3] AlfaMP.exe → AlfaServer (DTLS handshake)
     └─ ClientHello{protocol, client_version, hwid, session_token, nonce}
            ◄── ServerHello{server_protocol, server_version, accepted|reject_reason}

[4] If reject_reason in {OUTDATED_CLIENT, OUTDATED_SERVER, INVALID_TOKEN, BANNED}:
     └─ launcher displays actionable error + retry/update button
```

Each game resource on the server has its own `resource.version`. On player connect, server sends `[resource_name → version, sha256]` map; client validates its cached copy and re-downloads if mismatched.

## 5. Anti-cheat layers

| Layer | Where | What it catches |
|-------|-------|-----------------|
| Movement validation | AlfaServer | speedhack, teleport, fly, noclip |
| Spawn-rate limits | AlfaServer | spawn-spam, money-glitch |
| Resource-script sandbox | AlfaServer | malicious gamemode scripts can't escape Lua/JS VM |
| Memory integrity scan | AlfaMP.exe | known cheat-tool signatures (RAGE Trainer, etc) |
| HWID banlist | master + AlfaServer | banned hardware can't rejoin under alt account |
| Behavior heuristics | AlfaServer (Phase 3) | aimbot/ESP via statistical anomalies |
| Anti-debugger | AlfaMP.exe (Phase 4) | runtime memory editors |
| mTLS server↔master | Network | someone can't impersonate AlfaServer to spoof player counts |

## 6. RAGE-MP compat layer (data flow)

When a RAGE-MP gamemode runs on AlfaServer:

```
.cs script:           NAPI.Player.SendChatMessageToAll("hi")
                                   ↓
AlfaMP.RageMP.Compat shim:    foreach (var p in Pool.All()) p.SendChatMessage(...)
                                                                       ↓
                                       CFX API: TriggerClientEventInternal("chat:addMessage", ...)
                                                                       ↓
                                                            UDP packet to all players
```

User code is unchanged — shim presents identical NAPI/`mp.*` surface and translates each call to native CFX equivalents.

## 7. Build & deploy

```
GitHub repo                      GitHub Actions                         Result
──────────                       ──────────────                         ──────
push to main ──► workflow detects changed paths:
                  • master-server/**      → "Deploy to VPS" → PM2 reload alfa-master
                  • launcher/**           → "Build Launcher" → MSI + NSIS in Releases
                  • patches/** (in       → "Build AlfaMP Client (Windows)"
                    alfamp-client repo)    → AlfaMP.exe in Releases
```

All artifacts shipped to players go through:

```
GH Release → Cloudflare R2 (CDN) → players' machines
                                   (verified signature before install)
```

## 8. Tech stack summary

| Layer | Technology | Why |
|-------|------------|-----|
| Launcher UI | React 18 + TypeScript | Vast ecosystem, fast iteration |
| Launcher shell | Tauri 2 (Rust + WebView2) | 10 MB MSI vs Electron's 150 MB, native security |
| Master backend | Node 22 + Fastify + TypeScript | High throughput JSON APIs, low memory |
| Master DB | PostgreSQL 16 | Reliability, JSONB, mature |
| Master cache | Redis 7 | Rate-limit buckets, session cache |
| Game client | C++ (CitizenFX fork) + .NET 8 scripting | Inherited from CitizenFX; no realistic alternative without 3+ years of work |
| Game server | FXServer (CitizenFX-server) fork + .NET 8 mono runtime | Same |
| Compat layer | C# / NuGet | Targets the audience (RAGE-MP servers were ~100% C# / NodeJS) |
| Infra | Linux + nginx + PM2 + systemd | Boring tech, well-understood, reliable |
| CI/CD | GitHub Actions | Free tier covers us through ~50 servers; switch to self-hosted runners if cost matters |
| Crypto | libsodium (Ed25519, ChaCha20-Poly1305) + native TLS 1.3 stack | Audited, battle-tested, fast |

## 9. Repos

| Repo | Visibility | Contents |
|------|------------|----------|
| `orientalagency8-gif/alfamp` | private (currently) | This monorepo: launcher, master, compat-rage, docs, infra |
| `orientalagency8-gif/alfamp-client` | private | Our CitizenFX-fork: `patches/` + build workflow |
| (future) `alfamp/website`  | public | Landing page + docs site (Docusaurus) |
| (future) `alfamp/sdk-examples` | public | Example resources for hostеr onboarding |
