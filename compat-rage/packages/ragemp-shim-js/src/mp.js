// SPDX-License-Identifier: MIT
// Core: implementation of the RAGE-MP `mp.*` API on top of CitizenFX FXServer.
//
// In CFX, server-side resources access natives via a global API exported by the
// runtime (`global.exports`, `global.GetPlayers`, `TriggerClientEvent`, etc.).
// We translate every RAGE-MP call into one or more CFX native calls.

// ── Tiny helper: detect if we're actually running under FXServer ──────────────
const IS_FX = typeof GetPlayers === 'function' || typeof global.GetPlayers === 'function';
const fxCall = (name, ...args) => {
  const fn = (typeof global !== 'undefined' && global[name]) || (typeof globalThis !== 'undefined' && globalThis[name]);
  if (typeof fn !== 'function') throw new Error(`[ragemp-shim] CFX native not available: ${name}`);
  return fn(...args);
};

// ════════════════════════════════════════════════════════════════════════════
// Player
// ════════════════════════════════════════════════════════════════════════════
class Player {
  constructor(id) {
    this.id = Number(id);
    this._customData = {};
  }

  get name()   { return fxCall('GetPlayerName', String(this.id)) || 'Unknown'; }
  get ip()     { return (fxCall('GetPlayerEndpoint', String(this.id)) || '').split(':')[0]; }
  get ping()   { return fxCall('GetPlayerPing', String(this.id)) | 0; }
  get socialClub() { return this._identifier('license') || ''; }
  get rgscId() { return this._identifier('license') || ''; }
  get serial() { return this._identifier('discord') || this._identifier('steam') || ''; }
  get ipv4()   { return this.ip; }

  // ── Position / spatial ───────────────────────────────────────────────────
  get position() {
    const c = fxCall('GetEntityCoords', this._ped());
    return { x: c[0], y: c[1], z: c[2] };
  }
  set position(p) { fxCall('SetEntityCoords', this._ped(), p.x, p.y, p.z, false, false, false, false); }
  get heading()   { return fxCall('GetEntityHeading', this._ped()); }
  set heading(h)  { fxCall('SetEntityHeading', this._ped(), h); }
  get dimension() { return fxCall('GetPlayerRoutingBucket', String(this.id)); }
  set dimension(d){ fxCall('SetPlayerRoutingBucket', String(this.id), Number(d)); }

  // ── Health / armor ───────────────────────────────────────────────────────
  get health()  { return fxCall('GetEntityHealth', this._ped()); }
  set health(v) { fxCall('SetEntityHealth', this._ped(), Number(v)); }
  get armour()  { return fxCall('GetPedArmour', this._ped()); }
  set armour(v) { fxCall('SetPedArmour', this._ped(), Number(v)); }

  // ── Vehicle ───────────────────────────────────────────────────────────────
  get vehicle() {
    const h = fxCall('GetVehiclePedIsIn', this._ped(), false);
    return h ? Vehicle._wrap(h) : null;
  }
  get seat() { return fxCall('GetPedSeatNumber', this._ped()); }

  warpIntoVehicle(v, seat = -1) { fxCall('SetPedIntoVehicle', this._ped(), v.handle, seat); }

  // ── Chat / notify ───────────────────────────────────────────────────────
  outputChatBox(msg)       { this.call('chat:addMessage', { color: [255, 255, 255], args: [String(msg)] }); }
  notify(msg)              { this.call('__rageCompat:notify', String(msg)); }
  call(eventName, ...args) { fxCall('TriggerClientEventInternal', eventName, String(this.id), JSON.stringify(args), JSON.stringify(args).length); }
  callProc(eventName, ...args) { /* RAGE-only RPC — translate as call+ack later */ this.call(eventName, ...args); }

  // ── Kick / ban ──────────────────────────────────────────────────────────
  kick(reason = 'Kicked')  { fxCall('DropPlayer', String(this.id), String(reason)); }
  ban(reason = 'Banned')   { console.log(`[ragemp-shim] BAN ${this.name} (#${this.id}): ${reason}`); this.kick(`[BANNED] ${reason}`); }

  // ── Custom data buckets RAGE servers love ────────────────────────────────
  setVariable(key, value)  { this._customData[key] = value; this.call('__rageCompat:setVar', key, value); }
  getVariable(key)         { return this._customData[key]; }
  hasVariable(key)         { return key in this._customData; }

  // ── Internals ────────────────────────────────────────────────────────────
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

// ── players pool ─────────────────────────────────────────────────────────────
const _playerCache = new Map();
const _wrapPlayer = id => {
  if (!_playerCache.has(id)) _playerCache.set(id, new Player(id));
  return _playerCache.get(id);
};

const players = {
  toArray() {
    return (fxCall('GetPlayers') || []).map(id => _wrapPlayer(Number(id)));
  },
  at(id) { return _wrapPlayer(id); },
  exists(id) {
    return this.toArray().some(p => p.id === id);
  },
  get length() { return this.toArray().length; },
  broadcast(message) {
    for (const p of this.toArray()) p.outputChatBox(message);
  },
  call(eventName, ...args) {
    fxCall('TriggerClientEventInternal', eventName, '-1', JSON.stringify(args), JSON.stringify(args).length);
  },
  // RAGE: mp.players.forEach((p, i) => ...)
  forEach(fn) { this.toArray().forEach(fn); },
};

// ════════════════════════════════════════════════════════════════════════════
// Vehicle
// ════════════════════════════════════════════════════════════════════════════
const _vehicleRegistry = new Map();
class Vehicle {
  constructor(handle) { this.handle = handle; }

  get position() {
    const c = fxCall('GetEntityCoords', this.handle);
    return { x: c[0], y: c[1], z: c[2] };
  }
  set position(p) { fxCall('SetEntityCoords', this.handle, p.x, p.y, p.z, false, false, false, false); }
  get heading()   { return fxCall('GetEntityHeading', this.handle); }
  set heading(h)  { fxCall('SetEntityHeading', this.handle, h); }
  get velocity()  {
    const v = fxCall('GetEntityVelocity', this.handle);
    return { x: v[0], y: v[1], z: v[2] };
  }
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
    for (const p of players.toArray())
      if (fxCall('GetPlayerPed', String(p.id)) === ped) return p;
    return null;
  }

  destroy() { fxCall('DeleteEntity', this.handle); _vehicleRegistry.delete(this.handle); }

  static _wrap(handle) {
    if (!_vehicleRegistry.has(handle)) _vehicleRegistry.set(handle, new Vehicle(handle));
    return _vehicleRegistry.get(handle);
  }
}

const vehicles = {
  new(model, position, opts = {}) {
    const hash = typeof model === 'string' ? require('./joaat')(model) : Number(model);
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
// Colshape / Blip / Marker pools (broadcast to client-side shim)
// ════════════════════════════════════════════════════════════════════════════
const ColshapePool = {
  _all: new Map(), _next: 0,
  newSphere(position, range, dimension = 0) {
    const id = ++this._next;
    const shape = { id, type: 'sphere', position, range, dimension,
                    _inside: new Set(),
                    onEntityEnter(handler) { this._enter = handler; return this; },
                    onEntityLeave(handler) { this._leave = handler; return this; },
                    destroy() { ColshapePool._all.delete(id); } };
    this._all.set(id, shape);
    return shape;
  },
  newCuboid(p1, p2, dimension = 0) {
    const id = ++this._next;
    const shape = { id, type: 'cuboid', min: p1, max: p2, dimension,
                    _inside: new Set(),
                    onEntityEnter(handler) { this._enter = handler; return this; },
                    onEntityLeave(handler) { this._leave = handler; return this; },
                    destroy() { ColshapePool._all.delete(id); } };
    this._all.set(id, shape);
    return shape;
  },
  // simple per-second tick to dispatch enter/leave events
  _tick() {
    for (const shape of this._all.values()) {
      for (const p of players.toArray()) {
        if (p.dimension !== shape.dimension) continue;
        let inside;
        const pos = p.position;
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
                   destroy() { BlipPool._all.delete(id); players.call('__rageCompat:blip', 'delete', { id }); } };
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
                     destroy() { MarkerPool._all.delete(id); players.call('__rageCompat:marker', 'delete', { id }); } };
    this._all.set(id, marker);
    players.call('__rageCompat:marker', 'create', marker);
    return marker;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// Events
// ════════════════════════════════════════════════════════════════════════════
const RAGE_TO_CFX = {
  playerJoin:           'playerJoining',
  playerReady:          'playerSpawned',
  playerQuit:           'playerDropped',
  playerDeath:          'baseevents:onPlayerDied',
  playerChat:           'chatMessage',
  playerEnterVehicle:   'baseevents:enteredVehicle',
  playerExitVehicle:    'baseevents:leftVehicle',
  playerStartEnterVehicle: 'baseevents:enteringVehicle',
};

const EventBus = {
  _handlers: new Map(),
  add(name, handler) {
    const cfxName = RAGE_TO_CFX[name] || name;
    if (!this._handlers.has(cfxName)) {
      this._handlers.set(cfxName, []);
      fxCall('AddEventHandler', cfxName, (...args) => {
        // CFX passes source via implicit `source` global; we use the first numeric arg for now
        const src = (typeof global !== 'undefined' && global.source) ?? args[0];
        const player = (typeof src === 'number' || /^\d+$/.test(String(src))) ? _wrapPlayer(Number(src)) : null;
        for (const h of this._handlers.get(cfxName) || []) {
          try { player ? h(player, ...args) : h(...args); }
          catch (e) { console.error(`[ragemp-shim] event ${name} handler threw:`, e); }
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
    // Emits a local event — useful for unit tests / cross-resource bus
    const arr = this._handlers.get(name);
    if (arr) for (const h of arr) try { h(...args); } catch (e) { console.error(e); }
  },
  callRemote(name, ...args) {
    // From client side — no-op on server. RAGE has callRemote for client→server.
    console.warn(`[ragemp-shim] mp.events.callRemote called on server — ignoring (use mp.players.call)`);
  },
};

// ════════════════════════════════════════════════════════════════════════════
// World
// ════════════════════════════════════════════════════════════════════════════
const World = {
  time: {
    set(h, m = 0, s = 0) { players.call('__rageCompat:setTime', { h, m, s }); },
    hour: 12, minute: 0, second: 0,
  },
  weather: 'CLEAR',
  setWeather(name) { this.weather = name; players.call('__rageCompat:setWeather', name); },
  broadcast(msg) { players.broadcast(msg); },
};

// ════════════════════════════════════════════════════════════════════════════
// GUI (placeholder — client-side shim does the real CEF↔NUI bridging)
// ════════════════════════════════════════════════════════════════════════════
const GUI = {
  chat: {
    push(msg) { players.broadcast(msg); },
    activate(toggle) { players.call('__rageCompat:chatActivate', !!toggle); },
    show(toggle) { players.call('__rageCompat:chatShow', !!toggle); },
  },
};

module.exports = { Player, Vehicle, players, vehicles, ColshapePool, BlipPool, MarkerPool, EventBus, World, GUI };
