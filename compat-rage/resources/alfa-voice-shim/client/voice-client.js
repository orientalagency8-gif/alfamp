// SPDX-License-Identifier: MIT
// Client side: configure Mumble voice channel + proximity rules using CFX natives.

let configured = false;
let proximityRadius = 30;

// On configure event from server
on('alfa-voice:configure', (cfg) => {
    proximityRadius = Number(cfg.radius) || 30;
    try {
        MumbleSetVoiceChannel(1);                          // dedicated voice channel id
        NetworkSetVoiceChannel(1);
        SetVoiceChannelFromPlayerData(1);
        MumbleSetAudioOutputVolume(1.0);
        configured = true;
        console.log(`[alfa-voice] configured proximity=${proximityRadius}m`);
    } catch (e) { console.error('[alfa-voice] configure:', e); }
});

on('alfa-voice:mute', (opts) => {
    try { MumbleSetVolumeOverride(GetPlayerServerId(PlayerId()), 0.0); }
    catch (e) { console.error('[alfa-voice] mute:', e); }
});

on('alfa-voice:unmute', () => {
    try { MumbleSetVolumeOverride(GetPlayerServerId(PlayerId()), 1.0); }
    catch (e) { console.error('[alfa-voice] unmute:', e); }
});

// Proximity refresh: every 500 ms recompute who's in range
setTick(async () => {
    if (!configured) return;
    await Wait(500);

    const me = PlayerPedId();
    const myCoords = GetEntityCoords(me, true);
    const activePlayers = GetActivePlayers();

    for (const pid of activePlayers) {
        if (pid === PlayerId()) continue;
        const otherPed = GetPlayerPed(pid);
        if (!otherPed || otherPed === 0) continue;
        const c = GetEntityCoords(otherPed, true);
        const dx = c[0] - myCoords[0], dy = c[1] - myCoords[1], dz = c[2] - myCoords[2];
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist <= proximityRadius) {
            // Fall-off curve: 1.0 at 0m, 0.0 at radius
            const vol = Math.max(0, 1 - dist / proximityRadius);
            try { MumbleSetVolumeOverride(GetPlayerServerId(pid), vol); } catch {}
        } else {
            try { MumbleSetVolumeOverride(GetPlayerServerId(pid), 0); } catch {}
        }
    }
});

// Optional: expose mp.voiceChat compat for RAGE-style code via global hook
if (typeof mp !== 'undefined') {
    mp.voiceChat = {
        muted: false,
        cleanup() { /* noop */ },
        mute()    { this.muted = true;  TriggerEvent('alfa-voice:mute', {}); },
        unmute()  { this.muted = false; TriggerEvent('alfa-voice:unmute', {}); },
    };
}

console.log('[alfa-voice-shim] client ready');
