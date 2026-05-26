# Security model

This is the threat model and crypto choices for Alfa MP. Living document — update with every architectural change.

## 1. Threat model

| Attacker | Capability | What we defend |
|----------|------------|----------------|
| **Script kiddie** | Public RAGE/FiveM cheats, packet sniffer | Network is encrypted; cheats need re-engineering for our binary; server validates impossible moves |
| **Custom-cheat author** | Inject DLLs, modify memory, replay packets | Anti-tamper periodically validates code-section hash; nonce+timestamp prevents replay; HWID-ban on detect |
| **Server impersonator** | Spoofs being a legit AlfaServer to harvest player data | mTLS required for server↔master; players verify server's TLS cert + token signed by master |
| **MITM on player's network** | Intercepts launcher/game traffic at the ISP | All traffic TLS 1.3 / DTLS 1.3 with cert pinning — interception breaks the connection |
| **Malicious hoster** | Runs a server but tries to exfiltrate other servers' resources or break the master | Resources sandbox; servers can only push their own data to master; rate-limited register/heartbeat |
| **Stolen session token** | Token snatched from disk / RAM dump | Token is bound to HWID + IP-range; refresh requires both. Short TTL (15 min). |
| **Targeted DDoS** | Floods AlfaServer with bogus connections | DTLS cookie handshake (stateless first packet); UDP rate limits per IP; eventually CDN/Anycast |
| **Take-Two C&D** | Legal demand to take down | We don't redistribute R* assets; player owns GTA V; no branding similarity; complete & responsive process |

## 2. Cryptographic choices

We use **only audited, modern primitives** and **never roll our own crypto**.

| Purpose | Primitive | Why |
|---------|-----------|-----|
| TLS termination on master | TLS 1.3 via nginx + Let's Encrypt | Standard, free certs, automatic rotation |
| Allowed cipher suites | `TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256` | Modern AEAD only; no CBC, no RC4, no exportable |
| JWT signatures | **RS256** (RSA-2048 PSS) | Asymmetric — master signs, anyone with pubkey verifies. No shared secret to leak. |
| Player identity keypair | **Ed25519** | Small, fast, modern. Generated once, stored in `%LocalAppData%\AlfaMP\identity.key` (Windows DPAPI-protected) |
| Session token | JWT-RS256, claims `{user_id, hwid, ip_prefix, exp, iat, jti}` | jti allows server-side revocation |
| Game UDP encryption | **DTLS 1.3** (mbedtls or libsodium) with **ChaCha20-Poly1305** | DTLS = TLS-over-UDP; ChaCha20 faster than AES on CPUs without AES-NI |
| Key rotation interval | 300 s (5 min) | Limits exposure if key extracted |
| Resource signing | **Ed25519** sig over SHA-256 of resource tarball | Master signs all approved resources; AlfaServer verifies before load |
| Update package signing | **Ed25519** sig over installer file | Tauri updater plugin verifies before applying |
| Password storage | **bcrypt** cost 12 (for human passwords) | Slow-by-design, salt built-in |
| HWID hash | **SHA-256** of (CPU-id, MB-serial, primary-disk-UUID) | Salted with master-side per-user salt to prevent rainbow-table attacks |
| At-rest secrets (DB) | **pgcrypto** AES-256 for PII | Encrypted columns for email, IP-history |
| Local cred storage in launcher | **Windows DPAPI** (per-user) | OS-level, no extra setup |

## 3. Version-check handshake (required from Phase 0)

A user-friendly system: **every connect step checks compatibility upfront** so the player gets a clear "Update X" message instead of a cryptic disconnect.

### Launcher boot

```
Launcher loads
  └─ GET /api/v1/version-manifest
        ◄── {
              launcher_min: "0.3.0",
              client_min:   "1.2.4",
              client_recommended: "1.3.0",
              protocol_min: "alfamp/3",
              gamefiles_hash: "sha256:abc…",
              channel: "stable",
              update_url: "https://cdn.alfamp.gg/launcher/AlfaMP-Setup.msi"
            }
  └─ launcher.version < launcher_min  → block Connect, force auto-update
```

### Game-server handshake

```
AlfaMP.exe → AlfaServer (DTLS ClientHello)
  └─ payload: {
       protocol: "alfamp/3",
       client_version: "1.2.4",
       hwid: "...",
       session_token: "eyJ...",
       client_nonce: <random_24_bytes>,
       gamefiles_hash: "sha256:abc..."
     }

AlfaServer checks (in order, fail-fast):
  1. protocol == own protocol         → mismatch → reject(PROTOCOL_MISMATCH, "Server runs alfamp/4, you have alfamp/3 — update via launcher")
  2. client_version >= server_min     → too old → reject(CLIENT_TOO_OLD, update_url)
  3. session_token.signature valid (verify with master pubkey)
                                       → invalid → reject(AUTH_FAILED)
  4. session_token.hwid == ClientHello.hwid → mismatch → reject(TOKEN_BOUND_TO_OTHER_HWID)
  5. session_token.exp > now           → expired → reject(TOKEN_EXPIRED, "Re-login in launcher")
  6. gamefiles_hash matches expected   → mismatch → reject(GAMEFILES_TAMPERED)
  7. hwid not in banlist (local + master sync)
                                       → banned → reject(BANNED, ban_reason)

AlfaServer responds ServerHello with:
  • server_nonce
  • shared_session_key (ECDH-derived from client_nonce + server_nonce)
  • welcome_message + spawn_position + resources_to_download[]
```

### Resource version check (after connect)

```
Server sends manifest:
  [{name: "core-chat", version: "1.0.2", sha256: "..."},
   {name: "vehiclesync", version: "2.1.0", sha256: "..."},
   ...]

Client compares to cache:
  for each (name, version, sha256):
    if not cached or cache_sha256 != expected:
      download from server (encrypted channel)
      verify sha256 before extracting
      reject if Ed25519 server-sig invalid
```

## 4. Code integrity

### Player-facing binaries we ship are all signed

| Binary | Signing | Verifier |
|--------|---------|----------|
| `AlfaMP-Setup.msi` (launcher installer) | Authenticode cert (Sectigo EV) | Windows installer + SmartScreen |
| `Alfa MP.exe` (launcher binary) | Same cert | Tauri updater on each launch |
| `AlfaMP.exe` (game client) | Same cert | Launcher verifies before exec |
| `update-*.zip` (auto-update bundles) | Ed25519 by build server | Tauri updater plugin |
| Resource packs (`*.fxresource.zip`) | Ed25519 by master server | AlfaServer on load |

### Anti-tamper

- Launcher hashes `AlfaMP.exe` against known-good hash from `/api/v1/version-manifest` before launching
- `AlfaMP.exe` periodically (every 30 s) computes hash of its own `.text` section; mismatch → soft-disconnect + report
- Phase-4: anti-debugger checks (NtQueryInformationProcess, hardware breakpoints, timing checks)

## 5. Network hardening

- AlfaServer UDP/30120 behind **DDoS-protected hosting** (Phase 1 — currently bare VPS)
- DTLS uses cookie exchange in handshake — first packet is stateless, attacker can't pin server resources
- Per-IP connection rate limit: 5/min, burst 20
- Per-user rate limit on auth endpoints: 10/hour login attempts, then captcha
- nginx in front of master: 300 req/min/IP global, 60/min on `/v1/auth/*`

## 6. Data minimization & privacy

- We store: username, email (encrypted), hashed password, HWID hash, last 10 IPs
- We **do not** store: game-session positions, chat logs (unless reported), voice
- HWID is salted per-user — bypass via reset requires per-user master compromise, not just DB dump
- GDPR: full account export + delete via `/v1/me/export` and `/v1/me/delete`
- Logs retained 30 days, then deleted

## 7. Update & disclosure

- **Update cadence:** security patches within 7 days of disclosure; client/server forced to update via version-manifest
- **Disclosure:** `security@alfamp.gg` (when domain). PGP-signed advisories on Discord + GitHub Security Advisories
- **CVE:** we will request CVEs for any vulnerability rated CVSS ≥ 4.0
- **Bug-bounty:** at public beta — initial pool $1000-5000, scope = master + launcher + AlfaServer protocol parsers

## 8. What we explicitly DO NOT do

- ❌ Kernel-level anti-cheat (EAC/BattlEye style) — too invasive, triggers AV warnings, requires Windows kernel-signing certs which are expensive and slow to issue. Maybe Phase 5 if needed.
- ❌ Always-online DRM for the launcher — annoying for users; the moment it can be cracked, it's cracked
- ❌ Hardware-token 2FA mandatory — not for a gaming launcher
- ❌ Self-signed certs in production — we use real LE certs only

## 9. Phasing

| Phase | When | What lands |
|-------|------|-----------|
| 0 | Public alpha | HTTPS, version-manifest endpoint, version-check handshake, code-signing for MSI |
| 1 | Closed beta | RS256 JWT, Ed25519 player identity, DTLS for game UDP, resource signing |
| 2 | Public beta | Anti-tamper in client, mTLS server↔master, anti-cheat baseline (movement validation, HWID bans) |
| 3 | 6 months post-beta | Behavior heuristics, anti-debugger, bug bounty program |
| 4 | Year 2 | Self-hosted Sentry, security audit by 3rd-party firm |
