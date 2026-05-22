# Alfa MP

Open-source multiplayer platform for GTA V, forked from CitizenFX with improved netcode and tooling. Currently in alpha.

**Status:** development. Master-server live at http://104.194.140.221.

## Architecture

See [docs/MASTER-PLAN.md](docs/MASTER-PLAN.md) for the complete design document.

- [master-server/](master-server/) — server registry & auth API (Fastify + PostgreSQL)
- [infra/](infra/) — VPS setup & deploy automation
- [.github/workflows/](.github/workflows/) — CI/CD (auto-deploy on push to main)
- [docs/](docs/) — design documents, plans, legal

## Tech preview

```
Game Servers   ──heartbeat──►  Master Server  ◄──server browser──  Launcher
  (FXServer fork)                (Fastify + PG)                       (Tauri)
```

## Legal

Grand Theft Auto and Grand Theft Auto: V are registered trademarks of Take-Two Interactive Software. **Alfa MP is not affiliated with or endorsed by Take-Two Interactive Software, Rockstar Games, or any of their affiliates**, and is not responsible for user-generated content. Alfa MP does not host user servers. All user content is the property of its respective owners. All rights reserved.

© 2007–2026 Take-Two Interactive Software and its subsidiaries. All other marks and trademarks are properties of their respective owners. All rights reserved. © 2026 Alfa MP.

See [docs/LEGAL.md](docs/LEGAL.md) for full legal disclaimers.

## Built on

- [CitizenFX](https://github.com/citizenfx/fivem) — BSD-3-Clause licensed open-source GTA V multiplayer framework

Players must own a legal copy of Grand Theft Auto V. Alfa MP does not distribute any game assets.
