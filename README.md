# Alfa MP

**Open multiplayer platform for Grand Theft Auto V.** Better vehicle sync, open SDK, free hosting for community servers, drop-in migration from RAGE MP.

This monorepo holds every component of the Alfa MP project — the launcher players install, the master server that hosts the server browser, the C# compat-layer for RAGE MP refugees, and the patches we apply on top of CitizenFX to produce our branded game client.

---

## Quick map

| Folder | What | Build target | Status |
|--------|------|--------------|--------|
| **[launcher/](./launcher)** | Tauri 2 desktop launcher (MSI / NSIS installer). Server browser, auto-update, connect-to-server flow. | Windows MSI + NSIS — built on GitHub Actions windows-latest | Scaffold ✓, UI ✓, CI ⏳ |
| **[master-server/](./master-server)** | Fastify + PostgreSQL backend. Hosts `/v1/servers` registry, auth (`/v1/auth/*`), `/download` page, version-manifest. | Deployed to VPS via PM2 + GH Actions auto-deploy | Live ([http://104.194.140.221:8080](http://104.194.140.221:8080)) |
| **[compat-rage/](./compat-rage)** | `AlfaMP.RageMP.Compat` NuGet — drop-in `GTANetworkAPI` shim that lets RAGE MP gamemodes run on Alfa MP with near-zero source changes. Includes `rage2alfa.py` CLI converter and a hello-world example. | NuGet (net8.0) | v0.1 skeleton ✓ |
| **[docs/](./docs)** | Architecture, security model, roadmap, master plan, legal disclaimers. | Markdown → future Docusaurus site | Ongoing |
| **[infra/](./infra)** | VPS hardening, deploy scripts, GitHub-Actions bootstrap, secrets template. Python+paramiko driven. | n/a | Live + maintained |
| **[.github/workflows/](./.github/workflows)** | CI/CD: deploy-to-VPS for master; build-launcher for MSI+NSIS. | Reusable via `workflow_call` (planned) | Live |

The game client itself — our CitizenFX-based fork — lives in **[orientalagency8-gif/alfamp-client](https://github.com/orientalagency8-gif/alfamp-client)** (private). Build pipeline there fetches CitizenFX upstream + applies our `patches/` (rebrand, version-check, no-svadhesive, our-master) and produces `AlfaMP.exe`.

## Architecture at a glance

```
        ╔═════════════════ player's PC ═════════════════╗
        ║                                                ║
        ║  Alfa MP Launcher  ─────►  AlfaMP.exe (game)   ║
        ║   (Tauri/React)             (our CFX fork)     ║
        ║          │                       │             ║
        ╚══════════│═══════════════════════│═════════════╝
                   │ HTTPS+JWT             │ UDP+DTLS+nonce
                   │                       │
        ╔══════════│═══════════════════════│═════ our VPS ╗
        ║          ▼                       ▼              ║
        ║   master-server :443        AlfaServer :30120   ║
        ║   • /v1/servers              (FXServer fork)    ║
        ║   • /v1/auth/*               • runs resources   ║
        ║   • /v1/version-manifest     • our patches      ║
        ║   • /download                                   ║
        ║          │                       │              ║
        ║          ▼                       ▼              ║
        ║   PostgreSQL                Redis (sessions)    ║
        ╚═════════════════════════════════════════════════╝
```

See **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** for component-level diagrams, **[docs/SECURITY.md](./docs/SECURITY.md)** for the crypto + version-check model, **[docs/ROADMAP.md](./docs/ROADMAP.md)** for milestones.

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org) (`fix(launcher): …`, `feat(master): …`, `refactor(compat-rage): …`)
- **Branches:** `main` is always deployable. Feature work in `feat/short-name`, fixes in `fix/short-name`. Merge via squash.
- **Code style:** EditorConfig + Prettier (TS/JS) + .NET analyzers (C#) + ruff (Python). Lint is mandatory in CI.
- **No secrets in code.** Use `secrets.cfg` (gitignored) locally, GitHub Actions Secrets in CI, env vars on the VPS.

See **[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)** for details.

## Legal

Grand Theft Auto and Grand Theft Auto: V are registered trademarks of Take-Two Interactive Software. **Alfa MP is not affiliated with or endorsed by Take-Two Interactive Software, Rockstar Games, or any of their affiliates.** Players must own a legal copy of GTA V. Alfa MP does not distribute any game assets.

See **[docs/LEGAL.md](./docs/LEGAL.md)** for full disclaimers.

## License

- Code in this repo (launcher, master, compat-rage, tools, infra): **MIT**
- Our CitizenFX-fork patches: **Modified BSD 3-clause** (inherited from CitizenFX upstream)
- "Alfa MP" name and logo: trademark applied for; do not use in derivative works without permission

© 2026 Alfa MP project.
