// SPDX-License-Identifier: MIT
// Drop-in equivalent of GTANetworkAPI.NAPI — the static facade RAGE-MP servers
// reach for everywhere. We expose the most-used namespaces as nested static
// classes so existing code like `NAPI.Vehicle.Create(...)` keeps compiling.
//
// Coverage is intentionally surface-first: hot-path APIs from real RAGE-MP
// gamemodes (ESX-fork, RP-style, freeroam-spawners, dispatch systems) are
// implemented; long-tail edge APIs throw NotImplementedException with a
// pointer to the issue tracker so we collect real demand.
using System.Numerics;
using AlfaMP.RageMP.Compat.Entities;
using CFX = CitizenFX.Core;
using CFXAPI = CitizenFX.Core.Native.API;

namespace GTANetworkAPI;  // NB: kept under RAGE's own namespace so source migrations need zero `using` rewrites.

public static class NAPI
{
    /// <summary>Player operations.</summary>
    public static class Player
    {
        public static IReadOnlyList<Entities.Player> GetPlayers()
            => Entities.Player.Pool.All();

        public static Entities.Player? GetPlayerFromHandle(int handle)
            => Entities.Player.Pool.Find(handle);

        public static void SendChatMessageToPlayer(Entities.Player target, string message)
            => target.SendChatMessage(message);

        public static void SendChatMessageToAll(string message)
        {
            foreach (var p in Entities.Player.Pool.All()) p.SendChatMessage(message);
        }

        public static void SetPlayerPosition(Entities.Player p, Vector3 pos)
            => p.Position = pos;

        public static void KickPlayer(Entities.Player p, string reason = "Kicked")
            => CFXAPI.DropPlayer(p.Id.ToString(), reason);
    }

    /// <summary>Vehicle operations.</summary>
    public static class Vehicle
    {
        public static Entities.Vehicle Create(uint model, Vector3 position, float heading = 0f,
            int color1 = 0, int color2 = 0, string? numberPlate = null, int dimension = 0)
            => Entities.Vehicle.Create(model, position, heading, color1, color2, numberPlate, dimension);

        public static Entities.Vehicle Create(string model, Vector3 position, float heading = 0f,
            int color1 = 0, int color2 = 0, string? numberPlate = null, int dimension = 0)
            => Create(unchecked((uint)CFXAPI.GetHashKey(model)), position, heading, color1, color2, numberPlate, dimension);

        public static void DeleteVehicle(Entities.Vehicle v) => v.Delete();
    }

    /// <summary>World & environment.</summary>
    public static class World
    {
        public static void SetWeather(string weather)
        {
            // RAGE-MP weather names match CFX 1:1 (CLEAR, EXTRASUNNY, CLOUDS, OVERCAST, RAIN, …)
            foreach (var p in Entities.Player.Pool.All())
                CFXAPI.TriggerClientEventInternal("__rageCompat:setWeather", p.Id.ToString(), new[] { (object)weather }, 0);
        }

        public static void SetTime(int hour, int minute = 0, int second = 0)
        {
            foreach (var p in Entities.Player.Pool.All())
                CFXAPI.TriggerClientEventInternal("__rageCompat:setTime", p.Id.ToString(), new object[] { hour, minute, second }, 0);
        }
    }

    /// <summary>Resource lifecycle.</summary>
    public static class Resource
    {
        public static string Name => CFXAPI.GetCurrentResourceName();
        public static string GetResourcePath(string? resource = null)
            => CFXAPI.GetResourcePath(resource ?? CFXAPI.GetCurrentResourceName());
    }

    /// <summary>Server config.</summary>
    public static class Server
    {
        public static int MaxPlayers => CFXAPI.GetConvarInt("sv_maxclients", 32);
        public static string Name    => CFXAPI.GetConvar("sv_hostname", "Alfa MP server");
    }

    /// <summary>ClientEvent trigger — RAGE-MP equivalent of CFX TriggerClientEvent.</summary>
    public static void TriggerClientEvent(Entities.Player target, string eventName, params object[] args)
        => CFXAPI.TriggerClientEventInternal(eventName, target.Id.ToString(), args, 0);

    public static void TriggerClientEventForAll(string eventName, params object[] args)
        => CFXAPI.TriggerClientEventInternal(eventName, "-1", args, 0);
}
