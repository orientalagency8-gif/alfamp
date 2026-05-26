# Contributing to Alfa MP

This is a working monorepo, not a museum. Conventions exist so a fresh contributor can move quickly without breaking shared infra.

## 1. Repo layout (current — will evolve)

```
alfamp/                  ← this monorepo
├── launcher/            ← Tauri 2 desktop launcher
├── master-server/       ← Fastify+PG backend API (deployed to VPS)
├── compat-rage/         ← AlfaMP.RageMP.Compat NuGet for RAGE migration
├── docs/                ← Architecture, security, roadmap, legal
├── infra/               ← VPS hardening, deploy scripts (Python+paramiko)
├── .github/workflows/   ← CI/CD (auto-deploy, build-launcher)
├── secrets.cfg          ← gitignored: VPS creds, GitHub PAT, DB pwds
├── README.md
└── .gitignore

alfamp-client/           ← separate repo (private)
└── patches/             ← our patches applied on top of CitizenFX upstream
    ├── .github/workflows/build-client.yml
    └── patches/
        ├── rebrand.patch
        ├── no-svadhesive.patch
        ├── our-master.patch
        └── version-handshake.patch
```

Planned reorganization (after first green client build, separate PR):

```
apps/         ← user-facing products: launcher, website, docs-site
services/     ← backends: master, anticheat, telemetry
packages/     ← libraries: compat-rage, sdk-csharp, sdk-ts, protocol
tools/        ← CLI dev tools: rage2alfa, migration-assistant
infra/        ← IaC + deploy
docs/         ← markdown source
```

## 2. Commit conventions ([Conventional Commits](https://www.conventionalcommits.org))

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `build`.

Scopes (use the directory name): `launcher`, `master`, `compat-rage`, `client`, `infra`, `docs`, `ci`.

Examples:

```
feat(launcher): add Connect button to server row
fix(master): /v1/servers null when DB empty (closes #42)
refactor(compat-rage): split Entities/Vehicle into its own file
ci: install Win11 SDK 22000 in client build
docs(security): document version-handshake protocol
```

## 3. Branches

- `main` — always deployable. Merges via squash. No direct pushes.
- `feat/short-name` — feature work. Branch from main, PR back to main.
- `fix/short-name` — bug fixes.
- `hotfix/short-name` — urgent prod fixes (can skip review with maintainer ack).

## 4. Code style

| Lang | Linter / formatter | Run locally |
|------|--------------------|-------------|
| TypeScript / JS / TSX | Prettier + eslint | `npm run lint` |
| C# | `dotnet format` + Roslyn analyzers | `dotnet format` |
| Python | `ruff` + `black` | `ruff check . && black --check .` |
| Rust (Tauri shell) | `rustfmt` + `clippy` | `cargo fmt && cargo clippy` |
| Markdown | markdownlint-cli2 | `npx markdownlint-cli2 "docs/**/*.md"` |

`.editorconfig` enforces newlines, indent size, trailing whitespace cleanup across the repo.

Pre-commit hook (when set up): runs format-check on staged files. Not blocking yet (Phase 1 task).

## 5. Testing

| Component | Framework | Where tests live |
|-----------|-----------|------------------|
| launcher (TS) | Vitest | `launcher/src/**/*.test.ts` |
| launcher (Rust) | `cargo test` | `launcher/src-tauri/src/**/*` |
| master-server (TS) | Vitest + supertest | `master-server/src/**/*.test.ts` |
| compat-rage (C#) | xUnit | `compat-rage/tests/` |
| infra / tools (Python) | pytest | `infra/tests/`, `tools/tests/` |

Target: **every PR adds tests for new behavior** (or explains why exempt). CI fails if coverage on changed lines drops below 80%.

## 6. CI / CD gates

| Workflow | Triggered by | Must pass before merge |
|----------|--------------|------------------------|
| `lint.yml` (planned) | every push | format-check + lint all languages |
| `test.yml` (planned) | every push | run all package tests |
| `build-launcher.yml` | push to main on `launcher/**` | builds MSI + NSIS, attaches to Releases |
| `deploy.yml` | push to main on `master-server/**` | deploys master to VPS |
| `build-client.yml` (in alfamp-client) | push to main on `patches/**` | builds AlfaMP.exe |

## 7. Secrets

- **Never commit secrets.** `secrets.cfg` is gitignored.
- Local dev secrets in `secrets.cfg` (loaded by infra Python scripts).
- CI secrets in GitHub Actions Settings → Secrets and variables.
- Production secrets on the VPS in env files + PM2 ecosystem env section.
- Rotate any leaked secret **immediately** (especially the GitHub PAT — replace with fine-grained PAT).

## 8. PR review

PRs require **at least 1 review** before merge to main (we're a tiny team — for now this is owner+claude).

Review checklist:

- [ ] Lint passes
- [ ] Tests added/updated
- [ ] No new TODO without an issue link
- [ ] No new file > 500 KB unless explicitly a binary asset
- [ ] No `console.log`, `Debug.WriteLine`, `print()` for prod paths
- [ ] No secrets in diff
- [ ] CHANGELOG.md updated if user-visible (`launcher/CHANGELOG.md`, `master-server/CHANGELOG.md`, etc.)
- [ ] If a public API changed: docs/ updated

## 9. Releasing

| Component | Tag format | What happens |
|-----------|------------|--------------|
| Launcher | `launcher-v0.3.0` | build-launcher.yml builds + uploads MSI/NSIS to a Release |
| Master | `master-v0.4.0` | deploy.yml redeploys VPS at this tag |
| Compat-rage | `compat-rage-v0.2.0` | publishes NuGet package |
| Client | `client-v1.2.4` (in alfamp-client) | build-client.yml builds + uploads AlfaMP.exe |

Use semver: bump major on breaking change, minor on additive feature, patch on bugfix-only.

## 10. Onboarding a new contributor

1. Clone monorepo + clone alfamp-client side repo
2. Read `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`
3. Install local dev tools (Node 22, .NET 8, Python 3.12, Rust stable)
4. Run `npm install` in `launcher/`, `dotnet restore` in `compat-rage/`
5. Pick an issue tagged `good-first-issue`
6. Write a draft PR within first 3 days even if WIP — gets you reviewed quickly
