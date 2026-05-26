# AlfaMP.RageMP.Compat

**Run your RAGE MP C# gamemode on Alfa MP with (almost) zero changes.**

RAGE MP is on its way out. Alfa MP gives RAGE refugees a clean migration path: a NuGet package that re-implements the `GTANetworkAPI` / `NAPI` / `mp.*` surface on top of CitizenFX's FXServer runtime. Most resources need **one .csproj line changed** and **zero source changes**.

## What works today (skeleton release)

- ✅ `[ServerEvent(Event.PlayerConnected | Disconnected | Death | Spawn | Chat | EnterVehicle | ExitVehicle)]` attribute discovery
- ✅ `[RemoteEvent("name")]` client → server bridge
- ✅ `Player`: Name, Position, Heading, Health, Armor, Vehicle, Dimension, SteamId, IpAddress, SendChatMessage, SendNotification, Kick, Ban
- ✅ `Vehicle`: Position, Heading, Velocity, NumberPlate, EngineStatus, Health, Dimension, Driver, Delete
- ✅ `NAPI.Player.*`, `NAPI.Vehicle.*`, `NAPI.World.SetWeather/SetTime`, `NAPI.TriggerClientEvent`
- ✅ `rage2alfa` CLI: converts your `_resource.toml` → `fxmanifest.lua` and lays out folders

## Roadmap (next 6-8 weeks)

| | Component | ETA |
|--|-----------|-----|
| ⏳ | Colshapes / Markers / Blips / Objects | week 2 |
| ⏳ | Full GTA-native dictionary (1500+ natives via codegen) | week 3-4 |
| ⏳ | CEF → NUI auto-bridge runtime | week 4-5 |
| ⏳ | Voice proximity (RAGE → Mumble) | week 5 |
| ⏳ | Migration assistant: paste your repo URL → get diff | week 6-8 |

## How to migrate a RAGE MP resource

### 1. Convert the resource layout

```bash
python rage2alfa.py /path/to/my-rage-resource
# Creates /path/to/my-rage-resource-alfa/
#   ├── fxmanifest.lua           (from _resource.toml)
#   ├── server/                  (your .cs / .csproj / .dll)
#   ├── client/                  (your client JS, if any)
#   ├── html/                    (your CEF UI; see MIGRATION-NOTES.txt)
#   └── stream/                  (your .ymap / .ytyp / streamed assets)
```

### 2. Add ONE NuGet reference to your .csproj

```xml
<ItemGroup>
  <PackageReference Include="AlfaMP.RageMP.Compat" Version="0.1.*" />
</ItemGroup>
```

(Or use the `<ProjectReference>` if you build inside the alfamp monorepo.)

### 3. Drop into your AlfaServer

```bash
cp -r my-rage-resource-alfa /opt/alfaserver/server-data/resources/
echo 'ensure my-rage-resource-alfa' >> /opt/alfaserver/server-data/server.cfg
systemctl restart alfaserver
```

### 4. Done — most code will Just Work

Anything our shim doesn't cover yet throws `NotImplementedException` with a link to file an issue. We treat each missing API as a P0 ticket — we want to get to 95% coverage of real-world RAGE gamemodes by month 2.

## Example: hello-world

See `examples/hello-world/` — a single-file resource that compiles unchanged on both RAGE MP and Alfa MP.

```csharp
[ServerEvent(Event.PlayerConnected)]
public void OnPlayerJoined(Player player)
{
    player.SendNotification($"~g~Welcome, {player.Name}!");
    NAPI.Player.SendChatMessageToAll($"{player.Name} joined.");
}
```

## What does NOT work yet (be honest)

- ❌ Voice chat semantics — RAGE proximity voice differs from CitizenFX/Mumble; needs a config-side migration
- ❌ Custom natives RAGE-MP specific (`mp.world.getTunnelDirection`-style) — flag list maintained at `docs/RAGE-ONLY-NATIVES.md`
- ❌ Client-side C# scripts — RAGE MP runs client C# in its own .NET runtime; Alfa MP/CitizenFX runs client scripts in Lua/JS. We auto-rewrite is NOT planned — manual port required (usually small)
- ❌ Some specific physics edge cases (RAGE-MP and CitizenFX both ride on GTA V's RAGE engine, but interpolation and ownership semantics differ slightly — see `docs/PHYSICS-DELTAS.md`)

## Contributing

This is the bridge that determines whether the next 1000+ RAGE-MP servers come to Alfa MP or scatter. Every missing API is a P0 — file issues with the failing line of code and we'll patch within the day.

License: MIT.
