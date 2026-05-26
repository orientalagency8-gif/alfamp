# Security policy

If you've found a security issue in Alfa MP, please report it privately so we can fix it before public disclosure.

## Reporting a vulnerability

Report via one of:

- **GitHub Security Advisory** — https://github.com/orientalagency8-gif/alfamp/security/advisories/new (preferred — automatically private)
- **Email** — `security@alfamp.gg` (once domain is live)
- **Discord DM** to a maintainer (least preferred — only for non-sensitive triage)

Please include:

- A short description of the issue and its impact
- Steps to reproduce (or a PoC repo / video)
- Affected versions (launcher / client / master / compat-rage)
- Whether you'd like public credit when we publish the advisory

We'll acknowledge within **48 hours** and aim for a fix within:

| Severity | Target time-to-patch |
|----------|----------------------|
| Critical (RCE, auth bypass, mass cheat enable) | 72 hours |
| High (privilege escalation, data exfiltration) | 7 days |
| Medium (DoS, info disclosure) | 14 days |
| Low (hardening recommendations) | 30 days |

We **will not** sue or threaten legal action for good-faith security research that follows this policy.

## Scope

In scope:

- **alfamp** monorepo (launcher, master-server, compat-rage, infra, docs)
- **alfamp-client** repo (our patches)
- Production master at `master.alfamp.gg` (when live)
- Reference AlfaServer at `104.194.140.221:30120`

Out of scope (for now):

- Cfx.re / CitizenFX upstream code — report directly to them
- Third-party resources (gamemodes) running on community servers
- Take-Two assets / GTA V itself

## Bug bounty

A formal bug-bounty program launches at public beta (M9). Until then, security reports earn community recognition and our deep thanks. After M9 we expect rewards in the $50–$5000 range depending on severity and impact.

## Threat model & crypto choices

See **[docs/SECURITY.md](./docs/SECURITY.md)** for the detailed threat model, crypto primitives, version-check handshake, and phasing.
