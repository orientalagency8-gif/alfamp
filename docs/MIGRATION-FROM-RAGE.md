# Migration from RAGE MP to Alfa MP — day-1 guide

Goal: take an existing RAGE-MP server (C# and/or JavaScript) and have it running on Alfa MP **within a few hours**. The `compat-rage` package + `alfa-migrate` CLI do ~90% of the work; the rest is a short review of the auto-generated `MIGRATION-REPORT.md`.

This guide assumes you already have an AlfaServer running (see [installing AlfaServer](#installing-alfaserver)).

## 1. What's compatible out of the box

| RAGE MP feature | Status on Alfa MP | Notes |
|-----------------|-------------------|-------|
| `mp.players`, `mp.vehicles`, `mp.events`, `mp.world` (server JS) | ✅ via `@alfamp/ragemp-shim` | Drop-in `require('@alfamp/ragemp-shim')` installs global `mp` |
| `NAPI.*` / `GTANetworkAPI.*` (server C#) | ✅ via `AlfaMP.RageMP.Compat` NuGet | One `<PackageReference>` in your .csproj |
| `mp.gui.chat.*`, `mp.Browser` / CEF (client JS) | ✅ via `@alfamp/ragemp-client-shim` | Translates CEF API → CFX NUI under the hood, same Chromium engine |
| `mp.events.callRemote` server↔client | ✅ | Maps to `TriggerServerEvent` / `TriggerClientEvent` |
| Custom `.ymap` / `.ytyp` / `.ydr` / `.ytd` / `.yft` maps | ✅ | Same RAGE engine — files copy as-is into `stream/` |
| Custom vehicles (`vehicles.meta`, `carcols.meta`, `handling.meta`) | ✅ | Copy into `stream/`, declare in fxmanifest |
| Custom peds | ✅ | Same |
| HTML/JS/CSS interface in CEF browser | ✅ | Rendered identically — CFX NUI = same Chromium under the hood |
| MySQL / Redis / Postgres via standard NPM/NuGet drivers | ✅ | `mysql2`, `pg`, `ioredis`, `MySqlConnector` — all work as-is |
| Voice chat (RAGE built-in proximity) | 🟡 partial | Use included Mumble-compat resource (config differs) |
| Discord rich presence | 🟡 partial | Use separate `discord-rpc-compat` NuGet |
| RAGE-specific natives (`mp.raycasting.testCapsule` etc.) | 🟡 ~60% mapped | Long-tail filed as you hit them |
| Anti-cheat hooks (RAGE proprietary) | ❌ | Use our own anti-cheat baseline (M-series roadmap) |

## 2. The single-command migration

On any Linux/macOS/Windows machine with Python 3.11+:

```bash
# Clone our compat repo (one-time)
git clone https://github.com/orientalagency8-gif/alfamp.git
cd alfamp/compat-rage

# Run the migrator
python tool/alfa-migrate.py /path/to/your/ragemp-server
# → produces /path/to/your/ragemp-server-alfa/ with:
#   - converted resource folders (server/, client/, html/, stream/)
#   - fxmanifest.lua per resource
#   - injected _alfa_bootstrap.js requiring the shims
#   - package.json with @alfamp/ragemp-shim + @alfamp/ragemp-client-shim
#   - MIGRATION-REPORT.md listing any API calls that need manual review
```

Output structure (example for a server with 3 resources):

```
my-rageserver-alfa/
├── auth-system-alfa/
│   ├── fxmanifest.lua
│   ├── package.json
│   ├── server/
│   │   ├── _alfa_bootstrap.js     ← auto: require('@alfamp/ragemp-shim')
│   │   ├── auth.js                ← your code, unchanged
│   │   └── db.js                  ← your code, unchanged
│   ├── client/
│   │   ├── _alfa_bootstrap.js     ← auto: require('@alfamp/ragemp-client-shim')
│   │   └── ui.js                  ← your code, unchanged
│   ├── html/
│   │   └── login.html             ← your CEF page
│   └── MIGRATION-REPORT.md
├── inventory-system-alfa/
│   └── … same structure
└── interiors-pack-alfa/
    └── stream/{*.ymap, *.ytyp, *.ydr, *.ytd}
```

## 3. Deploy to your AlfaServer

```bash
# On your VPS running AlfaServer:
rsync -av my-rageserver-alfa/ root@your-server:/opt/alfaserver/server-data/resources/

# Install npm deps for shim
cd /opt/alfaserver/server-data/resources/auth-system-alfa
npm install

# Add ensure lines to server.cfg
echo 'ensure auth-system-alfa'      >> /opt/alfaserver/server-data/server.cfg
echo 'ensure inventory-system-alfa' >> /opt/alfaserver/server-data/server.cfg
echo 'ensure interiors-pack-alfa'   >> /opt/alfaserver/server-data/server.cfg

# Restart
systemctl restart alfaserver
journalctl -u alfaserver -f
```

## 4. C# resource migration (one .csproj line)

If your RAGE MP server is C# (the most common pattern):

```xml
<!-- before -->
<ItemGroup>
  <PackageReference Include="RAGEMP.ApiBridge" Version="..." />
</ItemGroup>

<!-- after -->
<ItemGroup>
  <PackageReference Include="AlfaMP.RageMP.Compat" Version="0.2.*" />
</ItemGroup>
```

That's it. `using GTANetworkAPI;` continues to compile, all your `Script` subclasses with `[ServerEvent(Event.PlayerConnected)]` keep working. Drop the produced `.dll` into the resource's `server/` folder.

## 5. UI rendering — CEF/Browser quality

RAGE MP's `mp.Browser` API and CitizenFX's NUI are **both backed by Chromium** — the visual output is identical. The shim converts:

```js
// RAGE MP (your code, no change):
const browser = mp.browsers.new('package://my-ui/index.html');
browser.execute(`window.dispatchEvent(new CustomEvent('serverData', { detail: ${JSON.stringify(data)} }))`);

// Under the hood the client-side shim turns this into:
SendNuiMessage(JSON.stringify({ type: 'execute', id: browserId,
                                 js: 'window.dispatchEvent(...)' }));
// And mounts your HTML in a small NUI overlay iframe so multiple Browsers can co-exist.
```

For server→UI data push, RAGE pattern still works:

```js
// server-side
player.call('updateInventory', { items: [...] });

// client-side ui.js
mp.events.add('updateInventory', data => {
    // Either send to your CEF browser:
    if (browser) browser.call('updateInventory', data);
    // Or directly via NUI:
    SendNuiMessage(JSON.stringify({ type: 'updateInventory', data }));
});
```

## 6. CDN for big asset packs (>100 MB)

If your RAGE MP server shipped a custom interior pack of, say, 500 MB, you don't want every player downloading it from your VPS. Use a CDN.

In your resource's `fxmanifest.lua`:

```lua
resource_manifest_version 'fxv2'
resource_cdn_url 'https://cdn.your-server.com/resources/auth-system-alfa/'
```

Recommended: Cloudflare R2 ($5/mo for several hundred GB outbound). See `docs/MAPS.md` §"Asset CDN" for setup.

For small community servers — we'll offer a free shared CDN at public beta.

## 7. Sync quality — what you get vs RAGE MP

| Aspect | RAGE MP default | Alfa MP default |
|--------|-----------------|-----------------|
| Tickrate | 30 Hz | 30 Hz now, **60 Hz** target (M6) |
| Vehicle ownership | owner-authoritative | **state-authoritative** (M7, via OneSync upgrade) — fewer rubber-bands |
| Soft reconciliation | hard snap | smooth lerp over 500 ms (M6) |
| Lag-comp guns | none | **server-side rewind** (M7) — bullets register at where target *was* on your screen |
| Adaptive sync by distance | uniform | nearby 60 Hz / far 5 Hz (M6) — saves bandwidth |
| Driver hand-off | jumpy | atomic transactional swap (M7) |

Currently you get RAGE-MP-equivalent quality out of the box; netcode-superiority lands in milestones M6-M7 (3-4 months).

## 8. Common gotchas & how to fix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Resource fails to start: "Cannot find module '@alfamp/ragemp-shim'" | npm install wasn't run | `cd <resource> && npm install` |
| CEF browser is blank | RAGE used `package://` URLs which our shim converts to `nui://` — check browser console (Win+\\ to open) | Make sure `index.html` is under `html/` and referenced in `fxmanifest.lua` `ui_page` |
| Voice chat doesn't work | RAGE proximity voice not mapped to our Mumble backend yet | Install `voice-bridge-mumble` resource (see roadmap) |
| Custom natives `mp.game.invoke(...)` fail | Native not in our 60-most-used map | Pass `0xHASH` directly: `mp.game.invoke('0x...', ...)` |
| Performance dip on connect | Your resource has 500MB+ assets without CDN | Set `resource_cdn_url` (§6) |

## Installing AlfaServer

If you haven't yet:

```bash
# On your Linux VPS:
mkdir -p /opt/alfaserver/server /opt/alfaserver/server-data
cd /opt/alfaserver/server
wget https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/latest/fx.tar.xz
tar -xJf fx.tar.xz && rm fx.tar.xz

# Bypass license-key check (we don't depend on Cfx.re keymaster):
cd alpine/opt/cfx-server
cp components.json components.json.bak
python3 -c "import json; p='components.json'; d=json.load(open(p)); json.dump([c for c in d if c!='svadhesive'], open(p,'w'), indent=2)"

# Base resources:
cd /opt/alfaserver/server-data
git clone --depth=1 https://github.com/citizenfx/cfx-server-data.git tmp
mv tmp/resources . && rm -rf tmp

# Minimal server.cfg with altV-style hardening:
cat > server.cfg <<'EOF'
endpoint_add_tcp "0.0.0.0:30120"
endpoint_add_udp "0.0.0.0:30120"
sv_hostname "My Alfa MP Server"
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
EOF

# Run wrapped in screen so systemd doesn't kill it on stdin EOF:
screen -L -Logfile /var/log/alfaserver.log -dmS alfaserver \
       /opt/alfaserver/server/run.sh +exec server.cfg
```

Register your server in the central master so players see it:

```bash
curl -X POST http://104.194.140.221:8080/v1/servers/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"My Server", "endpoint":"YOUR.IP:30120",
       "slots":64, "tags":["rp"], "region":"DE",
       "apiKey":"YOUR_API_KEY_FROM_DASHBOARD"}'
```

(Hoster dashboard for getting an API key lands in M4.)
