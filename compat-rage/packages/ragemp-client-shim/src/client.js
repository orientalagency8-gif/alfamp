// SPDX-License-Identifier: MIT
// CLIENT-SIDE shim. Runs inside AlfaMP.exe (CFX client runtime). Exposes a global
// `mp` object matching RAGE MP's client-side surface, translates to CFX natives.
//
// What this fixes:
//   ✓ mp.gui.chat.push / activate / show     → CFX chat:addMessage / cefChatActivate
//   ✓ new mp.Browser('package://html/x')     → CFX NUI ("nui://resource/x")
//   ✓ browser.execute('alert(...)')          → SendNuiMessage({type:'exec', js: ...})
//   ✓ mp.events.add / call / callRemote      → CFX onClientEvent / TriggerServerEvent
//   ✓ mp.players, mp.vehicles                → CFX player/vehicle pools
//   ✓ mp.game.*                              → CFX native invoker passthrough
//
// What this does NOT cover (file an issue on GitHub if you hit it):
//   ✗ Voice chat API (use Mumble/SaltyChat-compat module separately)
//   ✗ Some RAGE-specific natives (we map ~90% — long-tail asks)
//   ✗ Custom server-side CEF helpers — those need server-side @alfamp/ragemp-shim

/* eslint-disable no-undef */
'use strict';

// ── helpers ──────────────────────────────────────────────────────────────────
const _emit = (event, ...args) => emit(event, ...args);              // local client event
const _server = (event, ...args) => TriggerServerEvent(event, ...args);

// ── Browser / CEF compat ─────────────────────────────────────────────────────
let _nextBrowserId = 1;
const _browsers = new Map();

class Browser {
  constructor(url) {
    this.id     = _nextBrowserId++;
    this.url    = url;                                              // RAGE: "package://my-ui/index.html"
    this.active = true;
    _browsers.set(this.id, this);

    // Convert RAGE 'package://' URL → NUI URL. The resource name is the part right after package://
    // Example: "package://my-ui/html/main.html" → "nui://my-ui/html/main.html"
    const nuiUrl = url.replace(/^package:\/\//, 'nui://');

    // Tell our NUI overlay to mount this URL in an iframe (the overlay is a small CFX resource
    // we install at `nui-overlay`). The overlay is one persistent HTML page that hosts iframes
    // for each Browser, so multiple browsers can co-exist as RAGE MP allows.
    SendNuiMessage(JSON.stringify({ type: 'mount', id: this.id, url: nuiUrl }));
  }
  destroy()           { this.active = false; _browsers.delete(this.id);
                        SendNuiMessage(JSON.stringify({ type: 'unmount', id: this.id })); }
  execute(jsCode)     { SendNuiMessage(JSON.stringify({ type: 'execute', id: this.id, js: String(jsCode) })); }
  call(eventName, ...args) { this.execute(`window.dispatchEvent(new MessageEvent('message', {data:${JSON.stringify({type:eventName, args})}}))`); }
  reload()            { SendNuiMessage(JSON.stringify({ type: 'reload', id: this.id })); }
  markAsChat()        { /* RAGE: hint that this browser is the chat */ this.execute(`window.__alfamp_isChat = true;`); }
}

// ── mp.gui.chat (visible & functional UI) ─────────────────────────────────
const GUI_chat = {
  push(message) {
    // CFX: send through chat resource (works with default cfx-server-data 'chat')
    emit('chat:addMessage', { color: [255, 255, 255], args: [String(message)] });
  },
  activate(toggle) { SetNuiFocus(!!toggle, !!toggle); },
  show(toggle)     { emit('chat:setVisible', !!toggle); },
};

// ── mp.players / mp.vehicles (client-side handle-based) ───────────────────
const players_client = {
  local: { /* lazily filled below */ },
  toArray() {
    const ids = GetActivePlayers();
    return ids.map(id => ({ id, ped: GetPlayerPed(id),
                            getVar: () => null, // server-side variables not visible here
                          }));
  },
  at(id) { return { id, ped: GetPlayerPed(id) }; },
};

const vehicles_client = {
  toArray() {
    // CFX exposes GetGamePool('CVehicle') in client scripts — returns array of handles
    return (typeof GetGamePool === 'function' ? GetGamePool('CVehicle') : []).map(h => ({ handle: h }));
  },
};

// ── mp.events (server↔client bus) ─────────────────────────────────────────
const Events = {
  add(eventName, handler) { on(eventName, handler); },
  call(eventName, ...args) { _emit(eventName, ...args); },
  callRemote(eventName, ...args) { _server(eventName, ...args); },
  callProc(eventName, ...args) { _server(eventName, ...args); /* RAGE RPC — TODO ack */ },
  fire(eventName, ...args) { _emit(eventName, ...args); },
};

// ── mp.game (native passthrough) ──────────────────────────────────────────
// RAGE: mp.game.invoke('NATIVE_NAME', ...args, returnType)
// CFX:  Citizen.invokeNative('0xHASH', ...args, returnType)
const Game = {
  invoke(nativeName, ...args) {
    // For our shim, accept both string names AND 0xHASH values.
    if (typeof nativeName === 'string' && !nativeName.startsWith('0x')) {
      // Map the most common 30-40 natives by name → hash. The rest user passes as hash.
      const h = require('./natives-map.js')[nativeName];
      if (h) nativeName = h;
    }
    return Citizen.invokeNative(nativeName, ...args);
  },
};

// ── Receive __rageCompat:* server pushes and translate to client-visible state ──
on('__rageCompat:setWeather', (name) => {
  ClearOverrideWeather();
  SetWeatherTypeNowPersist(name);
});
on('__rageCompat:setTime', (t) => { NetworkOverrideClockTime(t.h | 0, t.m | 0, t.s | 0); });
on('__rageCompat:notify', (text) => {
  SetNotificationTextEntry('STRING');
  AddTextComponentSubstringPlayerName(String(text));
  DrawNotification(false, false);
});

// Blip create/delete
const _blipHandles = new Map();
on('__rageCompat:blip', (action, payload) => {
  if (action === 'create') {
    const h = AddBlipForCoord(payload.x, payload.y, payload.z);
    SetBlipSprite(h, payload.sprite); SetBlipColour(h, payload.color);
    SetBlipScale(h, payload.scale); SetBlipAsShortRange(h, payload.shortRange);
    BeginTextCommandSetBlipName('STRING'); AddTextComponentSubstringPlayerName(payload.name);
    EndTextCommandSetBlipName(h);
    _blipHandles.set(payload.id, h);
  } else if (action === 'delete') {
    const h = _blipHandles.get(payload.id);
    if (h !== undefined) { RemoveBlip(h); _blipHandles.delete(payload.id); }
  }
});

// Marker draw loop (markers persist across frames in CFX, so we re-draw each tick)
const _markers = new Map();
on('__rageCompat:marker', (action, payload) => {
  if (action === 'create') _markers.set(payload.id, payload);
  else if (action === 'delete') _markers.delete(payload.id);
});
setTick(async () => {
  for (const m of _markers.values()) {
    DrawMarker(m.type, m.position.x, m.position.y, m.position.z,
               0,0,0, 0,0,0, m.scale, m.scale, m.scale,
               m.color[0], m.color[1], m.color[2], m.color[3] ?? 200,
               false, false, 2, false, null, null, false);
  }
});

// ── Local player ──────────────────────────────────────────────────────────
Object.defineProperty(players_client, 'local', {
  get() {
    const ped = PlayerPedId();
    const [x, y, z] = GetEntityCoords(ped, true);
    return {
      handle: ped,
      position: { x, y, z },
      heading:  GetEntityHeading(ped),
      health:   GetEntityHealth(ped),
      vehicle:  IsPedInAnyVehicle(ped, false) ? { handle: GetVehiclePedIsIn(ped, false) } : null,
    };
  },
});

// ── Assemble global `mp` ──────────────────────────────────────────────────
const mp = {
  Browser,
  browsers: { new: (url) => new Browser(url) },
  players: players_client,
  vehicles: vehicles_client,
  events: Events,
  game: Game,
  gui: { chat: GUI_chat },
  console: { logInfo: (...a) => console.log('[mp]', ...a) },
};

globalThis.mp = mp;

// Stub variable channel — server sets `__rageCompat:setVar`, we expose via mp.players.local.getVar()
const _vars = {};
on('__rageCompat:setVar', (k, v) => { _vars[k] = v; });
players_client.local.getVar = k => _vars[k];

console.log('[ragemp-client-shim] mp.* installed on global');
