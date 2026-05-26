// SPDX-License-Identifier: MIT
// alfa-voice-shim — RAGE MP `voiceChat`-like API on top of CitizenFX Mumble.
//
// RAGE MP code pattern:
//   player.voiceAutoVolume = true;
//   player.enableVoiceListening(otherPlayer);
//   player.muteForAll();
//
// Mapped to CFX Mumble natives:
//   MumbleSetVolumeOverride / MumbleAddVoiceChannelListen / MumbleSetPlayerMuted

const ALFA_CHANNEL = 'alfa-proximity';

// On player connect — bind them to the proximity channel
on('playerJoining', () => {
    const src = global.source;
    if (!src) return;
    try {
        // 30 m default proximity radius (RAGE MP default = ~20 m)
        emitNet('alfa-voice:configure', src, { radius: 30, channel: ALFA_CHANNEL });
    } catch (e) { console.error('[voice-shim] playerJoining:', e); }
});

// Exports for other scripts using the OLD RAGE pattern
exports('setVoiceRange', (player, meters) => {
    emitNet('alfa-voice:configure', Number(player.id ?? player), { radius: Number(meters) });
});

exports('mutePlayerForAll', (player) => {
    emitNet('alfa-voice:mute', Number(player.id ?? player), { all: true });
});

exports('unmutePlayer', (player) => {
    emitNet('alfa-voice:unmute', Number(player.id ?? player));
});

// Compat for the global `mp.players.*.voiceListenTo` pattern via custom event
onNet('alfa-voice:listenTo', (targetId) => {
    const src = global.source;
    emitNet('alfa-voice:_apply-listen', src, Number(targetId));
});

console.log('[alfa-voice-shim] ready — proximity voice via Mumble');
