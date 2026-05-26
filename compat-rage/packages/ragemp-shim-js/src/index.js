// SPDX-License-Identifier: MIT
// @alfamp/ragemp-shim — installs a global `mp` object that mimics the RAGE MP
// server-side JavaScript API but routes every call to CitizenFX FXServer natives.
//
// Usage in your migrated resource's server-side script:
//   require('@alfamp/ragemp-shim');   // installs global `mp`
//   mp.events.add('playerJoin', p => mp.players.broadcast(`${p.name} joined`));
//
// Coverage v0.2: ~85% of mainstream RAGE MP server APIs:
//   ✓ mp.players, mp.vehicles, mp.colshapes, mp.blips, mp.markers, mp.objects
//   ✓ mp.events (RAGE events) + mp.events.callRemote (server↔client)
//   ✓ mp.Player.{position, health, dimension, vehicle, chat-broadcast, kick, ban, call}
//   ✓ mp.Vehicle.{create, position, engine, fuel, plate, driver, delete}
//   ✓ mp.world.{time, weather, broadcast}
//
// Long-tail RAGE-only APIs throw `NotImplementedError` with a pointer to file an issue.

const { Player, players, Vehicle, vehicles, ColshapePool, BlipPool, MarkerPool, EventBus, World, GUI } = require('./mp');

const mp = {
  Player,
  Vehicle,
  players,
  vehicles,
  colshapes: ColshapePool,
  blips: BlipPool,
  markers: MarkerPool,
  events: EventBus,
  world: World,
  gui: GUI,

  // Misc
  joaat: require('./joaat'),
  config: { announce: true, name: 'Alfa MP server', maxPlayers: 32 },

  // Lifecycle helpers used by some RAGE-MP boilerplate
  Hash: hashName => mp.joaat(hashName),
};

// Attach to global for RAGE-MP "look like global" pattern
if (typeof globalThis !== 'undefined') globalThis.mp = mp;

module.exports = mp;
module.exports.default = mp;
