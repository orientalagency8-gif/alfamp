# Admin dashboard + how to add a server

Live URL: **http://104.194.140.221:8080/admin**

The Alfa MP admin panel is a single-page web UI for managing the server catalog players see in the launcher. From there you can register new servers, issue API-keys to hosters, ban abusive servers, and watch live status.

## 1. Login

- Open http://104.194.140.221:8080/admin
- Enter the admin password (set via env `ADMIN_PASS` on the VPS; default is `change-me-now`)
- Session lives 1 hour, then re-login

> **Change the default password now:** SSH into the VPS, run `pm2 set alfa-master:ADMIN_PASS 'your-strong-password'; pm2 restart alfa-master --update-env`.

## 2. Add a server (admin-side, 30 seconds)

In the **«Добавить сервер»** section:

| Field | Example | Notes |
|-------|---------|-------|
| Название | `My RP Server` | Shown in the launcher |
| Endpoint | `1.2.3.4:30120` | Hoster's IP and FXServer port |
| Слотов | `64` | Max simultaneous players |
| Регион | `DE` | ISO-2 country code |
| Теги | `rp, voice, drift` | Comma-separated, shown as chips |
| Владелец | `john@hoster.com` | Free-text, only for our records |

Click **Зарегистрировать**. The dashboard returns an **API-key** (`alfa_xxx…`). **Hand this key to the hoster** — they need it to send heartbeats. The server appears in the launcher within ~30 seconds.

## 3. Add a server (hoster-side, via curl)

If you skip the admin UI and want the hoster to self-register, they just POST:

```bash
curl -X POST http://104.194.140.221:8080/v1/servers/register \
  -H 'Content-Type: application/json' \
  -d '{
    "name":     "My RP Server",
    "endpoint": "1.2.3.4:30120",
    "slots":    64,
    "tags":     ["rp", "voice"],
    "region":   "DE",
    "apiKey":   "alfa_xxxxxxxxxxxxxxxxxxxxxxxx"
  }'

# Response: { "id": "...", "status": "registered" }
```

Then every 20 seconds, their server must heartbeat:

```bash
curl -X POST http://104.194.140.221:8080/v1/servers/heartbeat \
  -H 'Content-Type: application/json' \
  -d '{
    "serverId": "<id returned above>",
    "apiKey":   "<same api key>",
    "players":  37
  }'
```

If no heartbeat for 60 seconds → server marked dead (hidden from launcher).
If no heartbeat for 2 minutes → server hard-deleted from registry.

## 4. Ban or remove a server

In the dashboard, every row has **Ban** and **Delete** buttons:

- **Ban** — server stays in DB but never appears in launcher; permanent until manually unbanned (via SQL)
- **Delete** — hard-remove. Hoster can re-register if you give them a fresh API-key.

## 5. Watch live metrics

The table refreshes every 15 s. For each server it shows:

- Player count vs slots
- Region + tags
- Last heartbeat time (how stale the data is)
- Status: 🟢 LIVE, ⚫ DEAD, 🔴 BANNED

A **DEMO** badge marks our seeded showcase servers (they auto-heartbeat for visual; deletable but useful for the launcher to not look empty).

## 6. Helping a hoster install Alfa MP

A hoster wants to spin up a new Alfa MP server. The full setup is documented at [MIGRATION-FROM-RAGE.md → "Installing AlfaServer"](./MIGRATION-FROM-RAGE.md#installing-alfaserver), but the short version:

```bash
# 1) On their VPS (Ubuntu/Debian recommended):
mkdir -p /opt/alfaserver/{server,server-data}
cd /opt/alfaserver/server
wget https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/29753-3db90c5a630beff426d51e3ece6c17706623b38b/fx.tar.xz
tar -xJf fx.tar.xz && rm fx.tar.xz

# 2) Strip the license-check (svadhesive):
cd alpine/opt/cfx-server
python3 -c "import json; p='components.json'; d=json.load(open(p)); json.dump([c for c in d if c!='svadhesive'], open(p,'w'), indent=2)"

# 3) Base resources:
cd /opt/alfaserver/server-data
git clone --depth=1 https://github.com/citizenfx/cfx-server-data.git tmp
mv tmp/resources . && rm -rf tmp

# 4) Optionally add Alfa-quality-of-life resources:
git clone --depth=1 https://github.com/orientalagency8-gif/alfamp.git tmp2
cp -r tmp2/compat-rage/resources/alfa-loading-screen   resources/
cp -r tmp2/compat-rage/resources/alfa-voice-shim       resources/
cp -r tmp2/compat-rage/resources/alfa-anticheat        resources/
rm -rf tmp2

# 5) server.cfg (paste-and-edit):
cat > server.cfg <<'EOF'
endpoint_add_tcp "0.0.0.0:30120"
endpoint_add_udp "0.0.0.0:30120"
sv_hostname "^4My Alfa MP Server"
sv_maxclients 64
sv_master1 ""
sv_licenseKey ""

# altV-style hardening
onesync on
sv_scriptHookAllowed 0
sv_pureLevel 2
sv_enforceGameBuild 3258

ensure mapmanager
ensure chat
ensure spawnmanager
ensure sessionmanager
ensure basic-gamemode
ensure hardcap

# Alfa quality-of-life pack:
ensure alfa-loading-screen
ensure alfa-voice-shim
ensure alfa-anticheat
EOF

# 6) Run wrapped in screen (systemd unit example in /docs/MIGRATION-FROM-RAGE.md):
screen -L -Logfile /var/log/alfaserver.log -dmS alfaserver \
  /opt/alfaserver/server/run.sh +exec server.cfg
```

Then they tell you their IP, you add the server in /admin → they get an API-key → wire up heartbeat (we ship `tools/heartbeat-cron.sh` — see below). Done.

## 7. Heartbeat cron snippet (give this to hosters)

```bash
#!/bin/bash
# /opt/alfaserver/heartbeat.sh — runs every 20 s via systemd-timer or cron
SERVER_ID="d97d4-…"           # from your /admin registration
API_KEY="alfa_xxxxxxxxxxxxxxxx"
PLAYERS=$(curl -sS --max-time 3 http://127.0.0.1:30120/players.json | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')

curl -sS -X POST http://104.194.140.221:8080/v1/servers/heartbeat \
  -H 'Content-Type: application/json' \
  -d "{\"serverId\":\"$SERVER_ID\",\"apiKey\":\"$API_KEY\",\"players\":$PLAYERS}"
```

Systemd timer (recommended over cron):

```ini
# /etc/systemd/system/alfaserver-heartbeat.service
[Unit]
Description=Alfa MP heartbeat
[Service]
ExecStart=/opt/alfaserver/heartbeat.sh
```

```ini
# /etc/systemd/system/alfaserver-heartbeat.timer
[Unit]
Description=Heartbeat every 20s
[Timer]
OnBootSec=10s
OnUnitActiveSec=20s
[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now alfaserver-heartbeat.timer
```

## 8. Pre-registered demo servers

The master is seeded with 4 demo servers (`is_demo: true`) so the launcher doesn't look empty during early beta. They auto-heartbeat with a slight random walk on player count. You can delete them from /admin once you have ≥5 real registered servers.

## 9. Security notes

- The current `/admin` uses password + session cookie. **Use a strong `ADMIN_PASS`** — anyone with admin can ban/delete servers and issue API-keys.
- Run behind nginx with HTTPS as soon as you have a domain (see [SECURITY.md](./SECURITY.md)).
- Audit log of all admin actions lands in `audit_log` table — query for compliance.
- Phase 2: per-hoster account login (instead of single admin password), 2FA, role-based permissions.

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Неверный пароль" | `ADMIN_PASS` not set or wrong | `pm2 set alfa-master:ADMIN_PASS 'xxx'; pm2 restart alfa-master --update-env` |
| Servers don't appear in launcher | Heartbeat not running | Verify systemd timer (`systemctl status alfaserver-heartbeat.timer`) |
| "registered" but immediately disappears | Wrong API-key in heartbeat | Re-issue from /admin → update heartbeat.sh |
| Hoster says players can't connect | Firewall on hoster's VPS | `ufw allow 30120/tcp && ufw allow 30120/udp` on their side |
