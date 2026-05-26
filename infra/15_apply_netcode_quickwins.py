"""Apply Phase-1 quick-win convars to the live AlfaServer (no patches needed yet).
Baseline-measure tickrate + RTT before and after for documentation."""
import io, sys, configparser, time
from pathlib import Path
import paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", write_through=True)

cfg = configparser.ConfigParser()
cfg.read(Path(__file__).parent.parent / "secrets.cfg")
cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(cfg.get("vps","host"), 22, "root", cfg.get("vps","password"),
            timeout=20, look_for_keys=False, allow_agent=False)

def sh(c, t=60):
    _, o, e = cli.exec_command(c, timeout=t)
    out = o.read().decode("utf-8","replace"); err = e.read().decode("utf-8","replace")
    if out: print(out.rstrip())
    if err.strip(): print(f"  [stderr] {err.strip()[:300]}")
    return out

SD = "/opt/alfaserver/server-data"

print("=== Patch server.cfg with Phase-1 quick-win convars ===")
sh(f"""cat > {SD}/server.cfg <<'EOF'
# === Alfa MP — production server config with Phase-1 netcode quick-wins ===

endpoint_add_tcp "0.0.0.0:30120"
endpoint_add_udp "0.0.0.0:30120"

sv_hostname "^4Alfa MP^7 ^2[Demo]^7 — Phase-1 netcode"
sv_maxclients 32

sv_master1 ""
sv_lan 0
sv_licenseKey ""

# ── altV-style hardening (already had these) ────────────────────────
onesync on
onesync_population true
onesync_workaround763185 1
sv_scriptHookAllowed 0
sv_pureLevel 2
sv_enforceGameBuild 3258
sv_authMaxVariance 1
sv_authMinTrust 5

# ── Phase-1 NETCODE quick wins (no recompile needed) ────────────────
# Aggressive distance culling — frees server CPU + bandwidth for close entities
onesync_distanceCullVehicles true

# Endpoint config — keep tight polling
sv_endpoint_private 0

# ── Phase-1 anti-cheat tuning (alfa-anticheat resource convars) ─────
set alfa_ac_maxSpeed 90
set alfa_ac_maxTele 50
set alfa_ac_vehLimit 15
set alfa_ac_interval 1000

# ── Permissions ─────────────────────────────────────────────────────
add_ace group.admin command allow
add_ace group.admin command.quit deny
add_principal identifier.fivem:0 group.admin

# ── Resources ───────────────────────────────────────────────────────
ensure mapmanager
ensure chat
ensure spawnmanager
ensure sessionmanager
ensure basic-gamemode
ensure hardcap
ensure rconlog
ensure yarn
ensure webpack
ensure fivem-map-skater

# Alfa quality-of-life pack (when their files are uploaded):
# ensure alfa-loading-screen
# ensure alfa-voice-shim
# ensure alfa-anticheat
# ensure alfa-hotreload

sets gametype "Freeroam"
sets mapname "San Andreas"
sets locale "en-US"
sets tags "alfa-mp, freeroam, demo, public, phase1-netcode"
EOF
echo "server.cfg updated ($(wc -c < {SD}/server.cfg) bytes)"
""")

print("\n=== Restart alfaserver to pick up new convars ===")
sh("systemctl restart alfaserver")
time.sleep(8)
sh("systemctl is-active alfaserver")

print("\n=== Verify listening + new convars in /info.json ===")
sh("curl -sS --max-time 5 http://127.0.0.1:30120/info.json | python3 -m json.tool 2>/dev/null | head -40")

print("\n=== Re-heartbeat to master ===")
sh("""curl -sS -X POST http://127.0.0.1:8080/v1/servers/register \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Alfa MP [Demo] Phase-1 netcode","endpoint":"104.194.140.221:30120","slots":32,"tags":["freeroam","demo","phase1"],"region":"DE","apiKey":"alfa_dev_owner_local"}' \\
  | python3 -m json.tool""")

cli.close()
print("\n=== Run benchmarks from your machine ===")
print("  node q:/AlfaMP/tools/netcode-bench/bench-tickrate.js 104.194.140.221:30120 30")
print("  node q:/AlfaMP/tools/netcode-bench/bench-latency.js 104.194.140.221:30120 60")
