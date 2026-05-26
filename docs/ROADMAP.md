# Roadmap

A living document. Updated when scope shifts. Targets are calendar-based for a 2-person team (owner + claude).

## Milestone overview

| Milestone | When | Definition of done |
|-----------|------|--------------------|
| **M0 — Foundation** | Day 1-7 (was 2026-05-22, mostly ✅) | Master live; CI/CD; launcher scaffold; client build pipeline; compat-rage skeleton |
| **M1 — First binaries** | Day 7-14 | First green client build = `AlfaMP.exe` artifact; first green launcher build = `.msi` artifact; `/download` page links to both |
| **M2 — Branded fork** | Week 3-4 | `patches/rebrand.patch`, `patches/no-svadhesive.patch`, `patches/our-master.patch`, `patches/version-handshake.patch` applied. Client + server work with our master only. No FiveM brand visible. |
| **M3 — Compat-rage v1.0** | Week 5-8 | NAPI/Player/Vehicle/Colshape/Marker/Blip 100% coverage; CEF→NUI bridge; voice helper; rage2alfa CLI hardened; example resources (chat, basic-gamemode, ESX-lite) ship under `examples/`. **Marketing-ready: any RAGE server migrates in <1 day.** |
| **M4 — Phase-0 security** | Week 6-8 (parallel to M3) | Domain + TLS; version-manifest endpoint live; launcher checks version before Connect; code-signing cert procured |
| **M5 — First production hosting** | Month 3 | Partner with one RAGE-MP refugee server, run them on AlfaServer in production. Real users, real load. |
| **M5.5 — Map UX layer** | Month 3-4 | CDN integration for `stream/`; pretty progressive loading screen; adaptive streaming priority by spawn distance; diff-based updates; `alfa-map-check` CLI; hot-reload in dev mode. **Comfortable play with multi-GB custom maps.** See [MAPS.md](./MAPS.md). |
| **M6 — Netcode Phase 1** | Month 3-4 | 60 Hz tickrate; extended vehicle snapshot (velocity/steering/throttle); soft reconciliation; adaptive priority by distance. **Visibly smoother than RAGE MP.** |
| **M7 — Netcode Phase 2** | Month 5-7 | State-authoritative vehicle sync; driver handoff protocol; server-side rewind (lag-compensated guns); collision arbitration. **Main competitive advantage in place.** |
| **M8 — Closed beta** | Month 8 | 20-50 invited testers; Discord community; bug bounty internal-only; telemetry (anon opt-in) |
| **M9 — Public beta** | Month 10 | Open registration; marketing push (Twitter/TikTok/streamers); 3-5 partner RP servers up; bug bounty public |
| **M10 — v1.0** | Month 12 | Production-stable; documented anti-cheat baseline; SDK + docs-site complete; sustainable ops |

## Current focus (this week)

- 🔥 First green client build (LFS-bypass + Win11 SDK installed in workflow; iterating on remaining msbuild errors)
- 🔥 First green launcher build (Tauri 2 API fix shipped; rebuilding)
- 🟡 Compat-rage skeleton (✅ done; next: add 50 more natives)
- 🟡 License-key from owner so AlfaServer can boot for live demo
- ⚪ Domain decision (.gg or .com)

## Side initiatives (lower priority but tracked)

- TS-first SDK package (`@alfamp/sdk-ts`): NPM types for resource authors
- Documentation site (Docusaurus or VitePress)
- Migration assistant: web app where hosters drop a `.zip` of their RAGE resource and get a downloadable converted version
- Crash reporter integration (Sentry self-hosted)
- Steam-style achievements/profiles in the launcher

## Known blockers and how we'll resolve

| Blocker | Plan |
|---------|------|
| CitizenFX LFS budget exhausted upstream | ✅ Bypassed via media.githubusercontent.com (works regardless of their LFS quota) |
| svadhesive license-key requirement | Get a temp key now (owner, 60 sec); strip svadhesive in `patches/no-svadhesive.patch` once first green build lands → permanent |
| Win11 SDK 22000 missing on windows-latest runner | ✅ Install via chocolatey step in workflow |
| No domain → no TLS → no production-ready master | Owner buys domain (5 min + $30); LE cert via certbot is automatic |
| Take-Two legal exposure grows with audience | Keep zero R* branding, keep `docs/LEGAL.md` updated, never redistribute game assets |
| Tiny team → bus-factor | Document everything; conventions; CI gates; bot-driven backups of secrets+DBs |

## Anti-goals (things we deliberately won't do)

- Will not build a custom game engine. CitizenFX foundation is non-negotiable.
- Will not support RDR2 in v1. GTA V only.
- Will not require email verification or 2FA at launch — too much friction for gamers.
- Will not implement kernel-level anti-cheat in v1 — too invasive, too risky, too expensive (certs).
- Will not chase mobile. Desktop Windows only at launch.
- Will not white-label our brand for other operators.
