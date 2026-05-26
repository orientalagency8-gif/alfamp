// SPDX-License-Identifier: MIT
// alfa-anticheat baseline. Three layers:
//   1) Movement validation — detect speedhack, teleport, fly hack server-side
//   2) Spawn-rate limits   — prevent vehicle/object/ped flood
//   3) HWID banlist        — persistent across reconnects, populated by /ban command
//
// All detections call `kickAndLog(player, reason, evidence)`.
// Reports flow to a webhook (DISCORD_WEBHOOK env var) and our master so admins see them.

const fs   = require('fs');
const path = require('path');

const BANS_FILE = path.join(GetResourcePath(GetCurrentResourceName()), 'hwid-bans.json');
const _bans = loadBans();

// ── Tunables (override via convar) ───────────────────────────────────────────
const cfg = {
    MAX_SPEED_MPS:        Number(GetConvar('alfa_ac_maxSpeed',  '90')),   // m/s on foot is impossible
    MAX_TELEPORT_M:       Number(GetConvar('alfa_ac_maxTele',   '50')),   // single-tick delta
    MAX_VEH_SPAWN_PER_MIN:Number(GetConvar('alfa_ac_vehLimit',  '15')),
    CHECK_INTERVAL_MS:    Number(GetConvar('alfa_ac_interval',  '1000')),
    DISCORD_WEBHOOK:      GetConvar('alfa_ac_webhook', ''),
};

// ── State per player ─────────────────────────────────────────────────────────
const _last = new Map();           // src → { pos, t, vehSpawnsThisMinute, minuteStart }

function loadBans() {
    try { return new Set(JSON.parse(fs.readFileSync(BANS_FILE, 'utf8'))); }
    catch { return new Set(); }
}
function persistBans() {
    try { fs.writeFileSync(BANS_FILE, JSON.stringify([..._bans], null, 2)); }
    catch (e) { console.error('[anticheat] persist:', e); }
}
function hwidOf(src) {
    const n = GetNumPlayerIdentifiers(String(src));
    for (let i = 0; i < n; i++) {
        const id = GetPlayerIdentifier(String(src), i);
        if (id?.startsWith('license:')) return id.slice(8);
    }
    return null;
}

function kickAndLog(src, reason, evidence = {}) {
    const name = GetPlayerName(String(src)) || '?';
    const hwid = hwidOf(src);
    console.warn(`[anticheat] KICK ${name} (${src}) hwid=${hwid?.slice(0,16)}… — ${reason}`, evidence);
    try { DropPlayer(String(src), `[Alfa MP Anti-Cheat] ${reason}`); } catch {}
    sendDiscord({
        title: `Anti-cheat kick: ${name}`,
        description: `**Reason:** ${reason}\n**HWID:** \`${hwid?.slice(0,32) ?? '?'}\``,
        fields: Object.entries(evidence).map(([k, v]) => ({ name: k, value: '```' + JSON.stringify(v) + '```', inline: true })),
        color: 0xd63a51,
    });
}

function ban(src, reason) {
    const hwid = hwidOf(src);
    if (hwid) { _bans.add(hwid); persistBans(); }
    kickAndLog(src, `BANNED — ${reason}`, { hwid: hwid?.slice(0,16) });
}

async function sendDiscord(embed) {
    if (!cfg.DISCORD_WEBHOOK) return;
    try {
        await fetch(cfg.DISCORD_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });
    } catch (e) { console.error('[anticheat] discord:', e); }
}

// ── On connect: HWID-ban check + state init ──────────────────────────────────
on('playerConnecting', (name, setKickReason, deferrals) => {
    deferrals.defer();
    const src = global.source;
    const hwid = hwidOf(src);
    if (hwid && _bans.has(hwid)) {
        deferrals.done('You are banned from this server.');
        return;
    }
    deferrals.done();
});

on('playerJoining', () => {
    const src = global.source;
    _last.set(src, { pos: null, t: Date.now(), vehSpawnsThisMinute: 0, minuteStart: Date.now() });
});

on('playerDropped', () => {
    _last.delete(global.source);
});

// ── Movement tick ────────────────────────────────────────────────────────────
setInterval(() => {
    const players = GetPlayers();
    for (const src of players) {
        try {
            const ped = GetPlayerPed(src);
            if (!ped || ped === 0) continue;
            const c = GetEntityCoords(ped);
            const state = _last.get(Number(src)) || { pos: null, t: Date.now(), vehSpawnsThisMinute: 0, minuteStart: Date.now() };
            const now = Date.now();
            const dt = (now - state.t) / 1000;

            if (state.pos && dt > 0.1) {
                const dx = c[0] - state.pos[0], dy = c[1] - state.pos[1], dz = c[2] - state.pos[2];
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const speed = dist / dt;

                if (dist > cfg.MAX_TELEPORT_M && !IsPedInAnyVehicle(ped, false)) {
                    kickAndLog(src, 'Teleport detected', { dist: dist.toFixed(2), dt: dt.toFixed(2) });
                    continue;
                }
                // Speed check applies only on foot
                if (speed > cfg.MAX_SPEED_MPS && !IsPedInAnyVehicle(ped, false)) {
                    kickAndLog(src, 'Speedhack detected', { speed_mps: speed.toFixed(2) });
                    continue;
                }
            }
            state.pos = c; state.t = now;
            _last.set(Number(src), state);
        } catch (e) { /* player likely disconnected mid-check */ }
    }
}, cfg.CHECK_INTERVAL_MS);

// ── Spawn-rate limit (server-side vehicle creation) ─────────────────────────
on('entityCreating', (handle) => {
    if (GetEntityType(handle) !== 2) return; // only vehicles
    const owner = NetworkGetEntityOwner(handle);
    if (owner === -1) return;
    const state = _last.get(owner) || { vehSpawnsThisMinute: 0, minuteStart: Date.now() };
    if (Date.now() - state.minuteStart > 60_000) {
        state.vehSpawnsThisMinute = 0; state.minuteStart = Date.now();
    }
    state.vehSpawnsThisMinute += 1;
    _last.set(owner, state);

    if (state.vehSpawnsThisMinute > cfg.MAX_VEH_SPAWN_PER_MIN) {
        CancelEvent();
        kickAndLog(owner, 'Vehicle spawn-rate exceeded', { perMinute: state.vehSpawnsThisMinute });
    }
});

// ── Admin commands ───────────────────────────────────────────────────────────
RegisterCommand('acban', (src, args) => {
    if (src !== 0 && !IsPlayerAceAllowed(String(src), 'group.admin')) return;
    const targetId = parseInt(args[0]);
    if (!targetId) return console.log('Usage: acban <playerId> <reason...>');
    const reason = args.slice(1).join(' ') || 'no reason given';
    ban(targetId, reason);
}, false);

RegisterCommand('acunban', (src, args) => {
    if (src !== 0 && !IsPlayerAceAllowed(String(src), 'group.admin')) return;
    const hwid = args[0];
    if (_bans.delete(hwid)) { persistBans(); console.log(`[anticheat] unbanned ${hwid.slice(0,16)}…`); }
}, false);

console.log(`[alfa-anticheat] ready (maxSpeed=${cfg.MAX_SPEED_MPS} m/s, maxTele=${cfg.MAX_TELEPORT_M}m, vehLimit=${cfg.MAX_VEH_SPAWN_PER_MIN}/min, bans=${_bans.size})`);
