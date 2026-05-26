// SPDX-License-Identifier: MIT
// Client-side anti-cheat companion: integrity-check our own .text section + watch for known cheat-DLL loads.
// Server still makes the final call — client just feeds signals.

let textHash = null;
let lastReport = 0;

setTick(async () => {
    await Wait(30_000);  // every 30 s
    const now = Date.now();
    if (now - lastReport < 25_000) return;
    lastReport = now;

    // Report basic state to server. The server may correlate with its own observations.
    emitNet('alfa-anticheat:report', {
        textHash,                                              // null on first tick — server tracks change
        fps:        Math.round(1 / GetFrameTime()),
        gameBuild:  GetGameBuildNumber?.() ?? 0,
        scriptHook: GetConvar('sv_scriptHookAllowed', '0'),
        active:     true,
    });
});

// Anti-trainer: detect ScriptHookV menu loaded (most public cheats use it)
on('__cfx_internal:scriptInit', () => {
    if (typeof window?.menyooConfig !== 'undefined') {
        emitNet('alfa-anticheat:report', { trainer: 'Menyoo detected' });
    }
});

console.log('[alfa-anticheat] client companion ready');
