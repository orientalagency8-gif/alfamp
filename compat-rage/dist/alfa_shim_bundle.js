// SPDX-License-Identifier: MIT
// @alfamp/ragemp-shim — SELF-CONTAINED BUNDLE (no npm dependencies).
// Drop this single file into your resource's server/ directory next to
// _alfa_bootstrap.js. The bootstrap just `require`s this file — no node_modules
// needed.
//
// Bundled from:
//   packages/ragemp-shim-js/src/{index,mp,joaat}.js
// Manually merged so resource hosters don't need npm setup.

'use strict';

// ════════════════════════════════════════════════════════════════════════════
// JOAAT hash (Jenkins One-At-A-Time)
// ════════════════════════════════════════════════════════════════════════════
function joaat(s) {
  s = String(s).toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + (h << 15)) >>> 0;
  return h | 0;
}

// ════════════════════════════════════════════════════════════════════════════
// Native bridge
// ════════════════════════════════════════════════════════════════════════════
const fxCall = (name, ...args) => {
  const fn = (typeof global !== 'undefined' && global[name]) || (typeof globalThis !== 'undefined' && globalThis[name]);
  if (typeof fn !== 'function') throw new Error(`[ragemp-shim] CFX native not available: ${name}`);
  return fn(...args);
};

// ════════════════════════════════════════════════════════════════════════════
// Player
// ════════════════════════════════════════════════════════════════════════════
class Player {
  constructor(id) { this.id = Number(id); this._customData = {}; }

  get name()   { return fxCall('GetPlayerName', String(this.id)) || 'Unknown'; }
  get ip()     { return (fxCall('GetPlayerEndpoint', String(this.id)) || '').split(':')[0]; }
  get ping()   { return fxCall('GetPlayerPing', String(this.id)) | 0; }
  get socialClub() { return this._identifier('license') || ''; }
  get rgscId() { return this._identifier('license') || ''; }
  get serial() { return this._identifier('discord') || this._identifier('steam') || ''; }
  get ipv4()   { return this.ip; }

  get position() { const c = fxCall('GetEntityCoords', this._ped()); return { x: c[0], y: c[1], z: c[2] }; }
  set position(p) { fxCall('SetEntityCoords', this._ped(), p.x, p.y, p.z, false, false, false, false); }
  get heading()   { return fxCall('GetEntityHeading', this._ped()); }
  set heading(h)  { fxCall('SetEntityHeading', this._ped(), h); }
  get dimension() { return fxCall('GetPlayerRoutingBucket', String(this.id)); }
  set dimension(d){ fxCall('SetPlayerRoutingBucket', String(this.id), Number(d)); }

  get health()  { return fxCall('GetEntityHealth', this._ped()); }
  set health(v) { fxCall('SetEntityHealth', this._ped(), Number(v)); }
  get armour()  { return fxCall('GetPedArmour', this._ped()); }
  set armour(v) { fxCall('SetPedArmour', this._ped(), Number(v)); }

  get vehicle() { const v = fxCall('GetVehiclePedIsIn', this._ped(), false); return v ? Vehicle._wrap(v) : null; }
  get seat() { return fxCall('GetPedSeatNumber', this._ped()); }
  warpIntoVehicle(v, seat = -1) { fxCall('SetPedIntoVehicle', this._ped(), v.handle, seat); }

  outputChatBox(msg) { this.call('chat:addMessage', { color: [255, 255, 255], args: [String(msg)] }); }
  notify(msg)        { this.call('__rageCompat:notify', String(msg)); }

  call(eventName, ...args) {
    fxCall('TriggerClientEventInternal', eventName, String(this.id), JSON.stringify(args), JSON.stringify(args).length);
  }
  callProc(eventName, ...args) { this.call(eventName, ...args); }

  kick(reason = 'Kicked') { fxCall('DropPlayer', String(this.id), String(reason)); }
  ban(reason = 'Banned')  { console.log(`[ragemp-shim] BAN ${this.name} (#${this.id}): ${reason}`); this.kick(`[BANNED] ${reason}`); }

  setVariable(key, value)  { this._customData[key] = value; this.call('__rageCompat:setVar', key, value); }
  getVariable(key)         { return this._customData[key]; }
  hasVariable(key)         { return key in this._customData; }

  _ped() { return fxCall('GetPlayerPed', String(this.id)); }
  _identifier(prefix) {
    const n = fxCall('GetNumPlayerIdentifiers', String(this.id));
    for (let i = 0; i < n; i++) {
      const ident = fxCall('GetPlayerIdentifier', String(this.id), i);
      if (ident && ident.startsWith(prefix + ':')) return ident.slice(prefix.length + 1);
    }
    return null;
  }
}

const _playerCache = new Map();
const _wrapPlayer = id => { if (!_playerCache.has(id)) _playerCache.set(id, new Player(id)); return _playerCache.get(id); };

const players = {
  toArray() { return (fxCall('GetPlayers') || []).map(id => _wrapPlayer(Number(id))); },
  at(id) { return _wrapPlayer(id); },
  exists(id) { return this.toArray().some(p => p.id === id); },
  get length() { return this.toArray().length; },
  broadcast(message) { for (const p of this.toArray()) p.outputChatBox(message); },
  call(eventName, ...args) { fxCall('TriggerClientEventInternal', eventName, '-1', JSON.stringify(args), JSON.stringify(args).length); },
  forEach(fn) { this.toArray().forEach(fn); },
};

// ════════════════════════════════════════════════════════════════════════════
// Vehicle
// ════════════════════════════════════════════════════════════════════════════
const _vehicleRegistry = new Map();
class Vehicle {
  constructor(handle) { this.handle = handle; }
  get position() { const c = fxCall('GetEntityCoords', this.handle); return { x: c[0], y: c[1], z: c[2] }; }
  set position(p) { fxCall('SetEntityCoords', this.handle, p.x, p.y, p.z, false, false, false, false); }
  get heading()   { return fxCall('GetEntityHeading', this.handle); }
  set heading(h)  { fxCall('SetEntityHeading', this.handle, h); }
  get velocity()  { const v = fxCall('GetEntityVelocity', this.handle); return { x: v[0], y: v[1], z: v[2] }; }
  get numberPlate()  { return fxCall('GetVehicleNumberPlateText', this.handle) || ''; }
  set numberPlate(t) { fxCall('SetVehicleNumberPlateText', this.handle, String(t)); }
  get engine()    { return fxCall('GetIsVehicleEngineRunning', this.handle); }
  set engine(on)  { fxCall('SetVehicleEngineOn', this.handle, !!on, true, true); }
  get health()    { return fxCall('GetVehicleBodyHealth', this.handle); }
  set health(h)   { fxCall('SetVehicleBodyHealth', this.handle, Number(h)); }
  get dimension()  { return fxCall('GetEntityRoutingBucket', this.handle); }
  set dimension(d) { fxCall('SetEntityRoutingBucket', this.handle, Number(d)); }
  get driver() {
    const ped = fxCall('GetPedInVehicleSeat', this.handle, -1);
    if (!ped) return null;
    for (const p of players.toArray()) if (fxCall('GetPlayerPed', String(p.id)) === ped) return p;
    return null;
  }
  destroy() { fxCall('DeleteEntity', this.handle); _vehicleRegistry.delete(this.handle); }
  static _wrap(handle) { if (!_vehicleRegistry.has(handle)) _vehicleRegistry.set(handle, new Vehicle(handle)); return _vehicleRegistry.get(handle); }
}

const vehicles = {
  new(model, position, opts = {}) {
    const hash = typeof model === 'string' ? joaat(model) : Number(model);
    const h = fxCall('CreateVehicle', hash, position.x, position.y, position.z, opts.heading || 0, true, true);
    const v = Vehicle._wrap(h);
    if (opts.numberPlate) v.numberPlate = opts.numberPlate;
    if (opts.dimension)   v.dimension   = opts.dimension;
    return v;
  },
  toArray() { return Array.from(_vehicleRegistry.values()); },
  at(handle) { return _vehicleRegistry.get(handle) || null; },
  exists(handle) { return _vehicleRegistry.has(handle); },
};

// ════════════════════════════════════════════════════════════════════════════
// Colshape / Blip / Marker pools
// ════════════════════════════════════════════════════════════════════════════
const ColshapePool = {
  _all: new Map(), _next: 0,
  newSphere(position, range, dimension = 0) {
    const id = ++this._next;
    const shape = { id, type: 'sphere', position, range, dimension, _inside: new Set(),
      onEntityEnter(h) { this._enter = h; return this; },
      onEntityLeave(h) { this._leave = h; return this; },
      destroy() { ColshapePool._all.delete(id); }
    };
    this._all.set(id, shape); return shape;
  },
  newCuboid(p1, p2, dimension = 0) {
    const id = ++this._next;
    const shape = { id, type: 'cuboid', min: p1, max: p2, dimension, _inside: new Set(),
      onEntityEnter(h) { this._enter = h; return this; },
      onEntityLeave(h) { this._leave = h; return this; },
      destroy() { ColshapePool._all.delete(id); }
    };
    this._all.set(id, shape); return shape;
  },
  _tick() {
    for (const shape of this._all.values()) {
      for (const p of players.toArray()) {
        if (p.dimension !== shape.dimension) continue;
        let inside; const pos = p.position;
        if (shape.type === 'sphere') {
          const dx = pos.x - shape.position.x, dy = pos.y - shape.position.y, dz = pos.z - shape.position.z;
          inside = dx*dx + dy*dy + dz*dz <= shape.range * shape.range;
        } else {
          inside = pos.x >= shape.min.x && pos.x <= shape.max.x &&
                   pos.y >= shape.min.y && pos.y <= shape.max.y &&
                   pos.z >= shape.min.z && pos.z <= shape.max.z;
        }
        const was = shape._inside.has(p.id);
        if (inside && !was) { shape._inside.add(p.id); shape._enter && shape._enter(shape, p); }
        else if (!inside && was) { shape._inside.delete(p.id); shape._leave && shape._leave(shape, p); }
      }
    }
  },
};
setInterval(() => { try { ColshapePool._tick(); } catch (e) { console.error('[ragemp-shim:colshape]', e); } }, 250);

const BlipPool = {
  _all: new Map(), _next: 0,
  new(sprite, position, opts = {}) {
    const id = ++this._next;
    const blip = { id, sprite, position,
      color: opts.color ?? 1, scale: opts.scale ?? 1, name: opts.name ?? 'Blip',
      shortRange: !!opts.shortRange, dimension: opts.dimension ?? 0,
      destroy() { BlipPool._all.delete(id); players.call('__rageCompat:blip', 'delete', { id }); }
    };
    this._all.set(id, blip);
    players.call('__rageCompat:blip', 'create', blip);
    return blip;
  },
};

const MarkerPool = {
  _all: new Map(), _next: 0,
  new(type, position, scale, opts = {}) {
    const id = ++this._next;
    const marker = { id, type, position, scale,
      color: opts.color ?? [214, 58, 81, 255],
      dimension: opts.dimension ?? 0,
      destroy() { MarkerPool._all.delete(id); players.call('__rageCompat:marker', 'delete', { id }); }
    };
    this._all.set(id, marker);
    players.call('__rageCompat:marker', 'create', marker);
    return marker;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// Events
// ════════════════════════════════════════════════════════════════════════════
const RAGE_TO_CFX = {
  playerJoin: 'playerJoining',
  playerReady: 'playerSpawned',
  playerQuit: 'playerDropped',
  playerDeath: 'baseevents:onPlayerDied',
  playerChat: 'chatMessage',
  playerEnterVehicle: 'baseevents:enteredVehicle',
  playerExitVehicle: 'baseevents:leftVehicle',
  playerStartEnterVehicle: 'baseevents:enteringVehicle',
};

const EventBus = {
  _handlers: new Map(),
  add(name, handler) {
    const cfxName = RAGE_TO_CFX[name] || name;
    if (!this._handlers.has(cfxName)) {
      this._handlers.set(cfxName, []);
      fxCall('AddEventHandler', cfxName, (...args) => {
        const src = (typeof global !== 'undefined' && global.source) ?? args[0];
        const player = (typeof src === 'number' || /^\d+$/.test(String(src))) ? _wrapPlayer(Number(src)) : null;
        for (const h of this._handlers.get(cfxName) || []) {
          try { player ? h(player, ...args) : h(...args); }
          catch (e) { console.error(`[ragemp-shim] event ${name} threw:`, e); }
        }
      });
    }
    this._handlers.get(cfxName).push(handler);
  },
  remove(name, handler) {
    const cfxName = RAGE_TO_CFX[name] || name;
    const arr = this._handlers.get(cfxName);
    if (arr) { const i = arr.indexOf(handler); if (i >= 0) arr.splice(i, 1); }
  },
  call(name, ...args) {
    const arr = this._handlers.get(name);
    if (arr) for (const h of arr) try { h(...args); } catch (e) { console.error(e); }
  },
  callRemote() { console.warn(`[ragemp-shim] mp.events.callRemote on server — use mp.players.call`); },
};

// ════════════════════════════════════════════════════════════════════════════
// World + GUI
// ════════════════════════════════════════════════════════════════════════════
const World = {
  time: { set(h, m = 0, s = 0) { players.call('__rageCompat:setTime', { h, m, s }); }, hour: 12, minute: 0, second: 0 },
  weather: 'CLEAR',
  setWeather(name) { this.weather = name; players.call('__rageCompat:setWeather', name); },
  broadcast(msg) { players.broadcast(msg); },
};

const GUI = {
  chat: {
    push(msg) { players.broadcast(msg); },
    activate(t) { players.call('__rageCompat:chatActivate', !!t); },
    show(t)     { players.call('__rageCompat:chatShow', !!t); },
  },
};

// ════════════════════════════════════════════════════════════════════════════
// Assemble + install global mp
// ════════════════════════════════════════════════════════════════════════════
const mp = {
  Player, Vehicle,
  players, vehicles,
  colshapes: ColshapePool,
  blips: BlipPool,
  markers: MarkerPool,
  events: EventBus,
  world: World,
  gui: GUI,
  joaat,
  Hash: name => joaat(name),
  config: { announce: true, name: 'Alfa MP server', maxPlayers: 32 },
};

if (typeof globalThis !== 'undefined') globalThis.mp = mp;

module.exports = mp;
module.exports.default = mp;

console.log('[alfa-shim] mp.* installed (bundled, no node_modules needed)');
