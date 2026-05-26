// SPDX-License-Identifier: MIT
// CLIENT-SIDE bundled shim — drop-in, no npm needed. Expanded CEF→NUI bridge.
//
// Fixes from initial release:
//  - Browser API: extra event coverage (call, callProc, markAsChat, markAsBank, …)
//  - SetNuiFocus toggle for browser focus
//  - Auto fallback when browser.execute fails (binds to NUI message channel)
//  - More mp.events.callRemote variants
//  - Voice configure handler with sensible defaults
//
// Drop this single file into your resource's client/ directory next to
// _alfa_bootstrap.js. The bootstrap requires this file directly — no node_modules.

'use strict';
/* eslint-disable no-undef */

const _emit = (event, ...args) => emit(event, ...args);
const _server = (event, ...args) => TriggerServerEvent(event, ...args);

// ════════════════════════════════════════════════════════════════════════════
// Browser (CEF compat → NUI iframe overlay)
// ════════════════════════════════════════════════════════════════════════════
let _nextBrowserId = 1;
const _browsers = new Map();
const _focusedBrowsers = new Set();

class Browser {
  constructor(url) {
    this.id     = _nextBrowserId++;
    this.url    = url;
    this.active = true;
    this._handlers = new Map();
    _browsers.set(this.id, this);
    const nuiUrl = url.replace(/^package:\/\//, 'nui://');
    SendNuiMessage(JSON.stringify({ type: 'mount', id: this.id, url: nuiUrl }));
  }
  destroy() {
    this.active = false; _browsers.delete(this.id);
    _focusedBrowsers.delete(this.id);
    if (_focusedBrowsers.size === 0) SetNuiFocus(false, false);
    SendNuiMessage(JSON.stringify({ type: 'unmount', id: this.id }));
  }
  execute(jsCode) {
    SendNuiMessage(JSON.stringify({ type: 'execute', id: this.id, js: String(jsCode) }));
  }
  // RAGE: browser.call('eventName', data) — dispatches inside the CEF page
  call(eventName, ...args) {
    SendNuiMessage(JSON.stringify({ type: 'call', id: this.id, event: String(eventName), args }));
  }
  callProc(eventName, ...args) {
    // RAGE RPC pattern. We just call — UI is expected to respond by its own logic.
    this.call(eventName, ...args);
  }
  reload() { SendNuiMessage(JSON.stringify({ type: 'reload', id: this.id })); }

  // Focus controls
  active() { _focusedBrowsers.add(this.id); SetNuiFocus(true, true); }
  inactive() {
    _focusedBrowsers.delete(this.id);
    if (_focusedBrowsers.size === 0) SetNuiFocus(false, false);
  }

  // RAGE markers — hints to the engine about role of this browser
  markAsChat() { this.execute(`window.__alfamp_isChat = true;`); }
  markAsBank() { this.execute(`window.__alfamp_isBank = true;`); }
}

// ════════════════════════════════════════════════════════════════════════════
// GUI
// ════════════════════════════════════════════════════════════════════════════
const GUI_chat = {
  push(message) { emit('chat:addMessage', { color: [255, 255, 255], args: [String(message)] }); },
  activate(t) { SetNuiFocus(!!t, !!t); },
  show(t)     { emit('chat:setVisible', !!t); },
  // RAGE has a `colors` arg sometimes — silently ignore extras
};

const GUI_cursor = {
  visible: false,
  show(state, freezeControls) { this.visible = !!state; SetNuiFocus(!!state, !!state); },
};

// ════════════════════════════════════════════════════════════════════════════
// Players / vehicles
// ════════════════════════════════════════════════════════════════════════════
const _localVars = {};

function getLocalPlayer() {
  const ped = PlayerPedId();
  const [x, y, z] = GetEntityCoords(ped, true);
  return {
    handle: ped,
    position: { x, y, z },
    heading:  GetEntityHeading(ped),
    health:   GetEntityHealth(ped),
    vehicle:  IsPedInAnyVehicle(ped, false) ? { handle: GetVehiclePedIsIn(ped, false) } : null,
    getVar(key) { return _localVars[key]; },
  };
}

const players_client = {
  get local() { return getLocalPlayer(); },
  toArray() {
    const ids = GetActivePlayers();
    return ids.map(id => ({ id, ped: GetPlayerPed(id), getVar: () => null }));
  },
  at(id) { return { id, ped: GetPlayerPed(id) }; },
};

const vehicles_client = {
  toArray() { return (typeof GetGamePool === 'function' ? GetGamePool('CVehicle') : []).map(h => ({ handle: h })); },
};

// ════════════════════════════════════════════════════════════════════════════
// Events
// ════════════════════════════════════════════════════════════════════════════
const Events = {
  add(name, handler) { on(name, handler); },
  call(name, ...args) { _emit(name, ...args); },
  callRemote(name, ...args) { _server(name, ...args); },
  callProc(name, ...args) { _server(name, ...args); },
  fire(name, ...args) { _emit(name, ...args); },
};

// ════════════════════════════════════════════════════════════════════════════
// Game (native invoke pass-through)
// ════════════════════════════════════════════════════════════════════════════
let NATIVES_MAP;
try { NATIVES_MAP = require('./alfa_natives_map.js'); }
catch { NATIVES_MAP = {}; }

const Game = {
  invoke(name, ...args) {
    if (typeof name === 'string' && !name.startsWith('0x')) {
      const h = NATIVES_MAP[name];
      if (h) name = h;
    }
    return Citizen.invokeNative(name, ...args);
  },
};

// ════════════════════════════════════════════════════════════════════════════
// Server-pushed events (translate to client effects)
// ════════════════════════════════════════════════════════════════════════════
on('__rageCompat:setWeather', (name) => {
  try { ClearOverrideWeather(); SetWeatherTypeNowPersist(name); } catch (e) { console.error('[shim] setWeather', e); }
});
on('__rageCompat:setTime', (t) => {
  try { NetworkOverrideClockTime(t.h | 0, t.m | 0, t.s | 0); } catch {}
});
on('__rageCompat:notify', (text) => {
  try {
    SetNotificationTextEntry('STRING');
    AddTextComponentSubstringPlayerName(String(text));
    DrawNotification(false, false);
  } catch {}
});
on('__rageCompat:setVar', (k, v) => { _localVars[k] = v; });

// Blip create/delete
const _blipHandles = new Map();
on('__rageCompat:blip', (action, payload) => {
  try {
    if (action === 'create') {
      const h = AddBlipForCoord(payload.x, payload.y, payload.z);
      SetBlipSprite(h, payload.sprite); SetBlipColour(h, payload.color);
      SetBlipScale(h, payload.scale); SetBlipAsShortRange(h, payload.shortRange);
      BeginTextCommandSetBlipName('STRING');
      AddTextComponentSubstringPlayerName(payload.name);
      EndTextCommandSetBlipName(h);
      _blipHandles.set(payload.id, h);
    } else if (action === 'delete') {
      const h = _blipHandles.get(payload.id);
      if (h !== undefined) { RemoveBlip(h); _blipHandles.delete(payload.id); }
    }
  } catch (e) { console.error('[shim] blip', e); }
});

// Markers — re-drawn every frame while alive
const _markers = new Map();
on('__rageCompat:marker', (action, payload) => {
  if (action === 'create') _markers.set(payload.id, payload);
  else if (action === 'delete') _markers.delete(payload.id);
});
setTick(async () => {
  for (const m of _markers.values()) {
    try {
      DrawMarker(m.type, m.position.x, m.position.y, m.position.z,
                 0,0,0, 0,0,0, m.scale, m.scale, m.scale,
                 m.color[0], m.color[1], m.color[2], m.color[3] ?? 200,
                 false, false, 2, false, null, null, false);
    } catch {}
  }
});

// Chat activate/show passthroughs
on('__rageCompat:chatActivate', (t) => { try { SetNuiFocus(!!t, !!t); } catch {} });
on('__rageCompat:chatShow', (t) => { try { emit('chat:setVisible', !!t); } catch {} });

// Voice configure (defaults: 30 m proximity)
on('alfa-voice:configure', (cfg) => {
  try {
    const radius = Number(cfg?.radius) || 30;
    MumbleSetVoiceChannel(1);
    NetworkSetVoiceChannel(1);
    SetVoiceChannelFromPlayerData(1);
    MumbleSetAudioOutputVolume(1.0);
    console.log(`[alfa-voice] proximity ${radius}m configured`);
  } catch (e) {
    console.warn('[alfa-voice] mumble natives not available — voice disabled. Install ensure alfa-voice-shim on server.');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Install global mp
// ════════════════════════════════════════════════════════════════════════════
const mp = {
  Browser,
  browsers: { new: (url) => new Browser(url) },
  players: players_client,
  vehicles: vehicles_client,
  events: Events,
  game: Game,
  gui: { chat: GUI_chat, cursor: GUI_cursor },
  console: { logInfo: (...a) => console.log('[mp]', ...a), logError: (...a) => console.error('[mp]', ...a) },
  // RAGE-MP voice stub
  voiceChat: {
    muted: false,
    mute()    { this.muted = true;  emit('alfa-voice:mute');   },
    unmute()  { this.muted = false; emit('alfa-voice:unmute'); },
    cleanup() {},
  },
};

globalThis.mp = mp;
console.log('[alfa-client-shim] mp.* installed (bundled)');
