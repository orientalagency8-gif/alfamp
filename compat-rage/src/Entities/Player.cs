// SPDX-License-Identifier: MIT
using System.Numerics;
using CFX = CitizenFX.Core;
using CFXAPI = CitizenFX.Core.Native.API;

namespace GTANetworkAPI;

/// <summary>RAGE-MP compatible Player wrapper around a CitizenFX player handle.</summary>
public sealed class Player
{
    /// <summary>Server-side CFX player id (the numeric source).</summary>
    public int Id { get; }

    internal Player(int id) { Id = id; }

    // ── Identity ───────────────────────────────────────────────────────────
    public string Name
    {
        get => CFXAPI.GetPlayerName(Id.ToString()) ?? "Unknown";
    }

    public string SocialClubName => GetIdentifier("license") ?? "";
    public ulong  SocialClubId   => 0; // RSC ID not present in CFX; populate via identifier lookup later

    /// <summary>Steam ID if the player connected via Steam. Empty string otherwise.</summary>
    public string SteamId => GetIdentifier("steam") ?? "";

    public string IpAddress => CFXAPI.GetPlayerEndpoint(Id.ToString())?.Split(':')[0] ?? "";

    // ── Movement / spatial ─────────────────────────────────────────────────
    public Vector3 Position
    {
        get { var c = CFXAPI.GetEntityCoords(Ped); return new Vector3(c.X, c.Y, c.Z); }
        set { CFXAPI.SetEntityCoords(Ped, value.X, value.Y, value.Z, false, false, false, false); }
    }

    public float Heading
    {
        get => CFXAPI.GetEntityHeading(Ped);
        set => CFXAPI.SetEntityHeading(Ped, value);
    }

    public int Dimension
    {
        get => CFXAPI.GetPlayerRoutingBucket(Id.ToString());
        set => CFXAPI.SetPlayerRoutingBucket(Id.ToString(), value);
    }

    // ── Health / armor ─────────────────────────────────────────────────────
    public int Health
    {
        get => CFXAPI.GetEntityHealth(Ped);
        set => CFXAPI.SetEntityHealth(Ped, value);
    }

    public int Armor
    {
        get => CFXAPI.GetPedArmour(Ped);
        set => CFXAPI.SetPedArmour(Ped, value);
    }

    // ── Vehicle ─────────────────────────────────────────────────────────────
    public Vehicle? Vehicle
    {
        get
        {
            var v = CFXAPI.GetVehiclePedIsIn(Ped, false);
            return v == 0 ? null : Vehicle.Pool.Wrap(v);
        }
    }

    public void WarpIntoVehicle(Vehicle v, int seat = -1)
        => CFXAPI.SetPedIntoVehicle(Ped, v.Handle, seat);

    // ── Chat / notifications ───────────────────────────────────────────────
    public void SendChatMessage(string message)
        => NAPI.TriggerClientEvent(this, "chat:addMessage", new { color = new[] { 255, 255, 255 }, args = new[] { message } });

    public void SendNotification(string message)
        => NAPI.TriggerClientEvent(this, "__rageCompat:notify", message);

    public void Kick(string reason = "Kicked")
        => CFXAPI.DropPlayer(Id.ToString(), reason);

    public void Ban(string reason = "Banned")
    {
        // RAGE-MP semantics: persistent ban. We log the identifier so the resource can persist it however it likes.
        CFX.Debug.WriteLine($"[compat] BAN {Name} (id={Id}) — {reason}");
        Kick($"[BANNED] {reason}");
    }

    // ── Internal helpers ───────────────────────────────────────────────────
    private int Ped => CFXAPI.GetPlayerPed(Id.ToString());

    private string? GetIdentifier(string prefix)
    {
        int n = CFXAPI.GetNumPlayerIdentifiers(Id.ToString());
        for (int i = 0; i < n; i++)
        {
            var ident = CFXAPI.GetPlayerIdentifier(Id.ToString(), i);
            if (ident != null && ident.StartsWith(prefix + ":")) return ident.Substring(prefix.Length + 1);
        }
        return null;
    }

    // ── Pool: keep a live list of all connected players ────────────────────
    public static class Pool
    {
        public static IReadOnlyList<Player> All()
        {
            var list = new List<Player>();
            foreach (var p in CFX.Native.Function.Call<dynamic>(CFX.Native.Hash.GET_PLAYERS) ?? Enumerable.Empty<dynamic>())
            {
                if (int.TryParse(p?.ToString(), out var id)) list.Add(new Player(id));
            }
            return list;
        }

        public static Player? Find(int handle) => All().FirstOrDefault(p => p.Id == handle);
    }
}
