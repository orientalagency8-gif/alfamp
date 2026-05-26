// HELLO-RAGE-SERVER — minimal RAGE-MP server resource that runs unchanged on Alfa MP
// after `alfa-migrate` conversion. This file is VALID RAGE-MP JavaScript.

console.log('[hello-rage] resource starting');

// ── Welcome new players ──────────────────────────────────────────────────
mp.events.add('playerJoin', player => {
    console.log(`[hello-rage] ${player.name} joined`);
    player.outputChatBox(`!{#4dffac}Welcome to Alfa MP, ${player.name}!`);
    mp.players.broadcast(`${player.name} joined the server`);
    player.position = new mp.Vector3(-1037.0, -2737.0, 20.0);
});

mp.events.add('playerQuit', (player, exitType, reason) => {
    mp.players.broadcast(`${player.name} left (${reason || exitType})`);
});

// ── /car <model> command via chat ────────────────────────────────────────
mp.events.add('playerChat', (player, message) => {
    if (!message.startsWith('/car ')) return;
    const model = message.slice(5).trim();
    const pos = player.position;
    const car = mp.vehicles.new(mp.joaat(model),
        new mp.Vector3(pos.x + 3, pos.y, pos.z),
        { numberPlate: 'ALFA-MP' });
    player.notify(`Spawned ${model}`);
    player.warpIntoVehicle(car, -1);
});

// ── /tp x y z command ────────────────────────────────────────────────────
mp.events.add('playerChat', (player, message) => {
    if (!message.startsWith('/tp ')) return;
    const [, x, y, z] = message.split(/\s+/);
    player.position = new mp.Vector3(parseFloat(x), parseFloat(y), parseFloat(z));
    player.notify(`Teleported to ${x} ${y} ${z}`);
});

// ── ColShape demo: heal anyone inside a sphere at LSIA ────────────────────
const healZone = mp.colshapes.newSphere(new mp.Vector3(-1037, -2737, 20), 5.0);
healZone.onEntityEnter((shape, player) => {
    player.notify('~g~Healing zone — health restored');
    player.health = 200;
});

console.log('[hello-rage] resource ready');
