// SPDX-License-Identifier: MIT
using System.Collections.Concurrent;
using System.Numerics;
using CFXAPI = CitizenFX.Core.Native.API;

namespace GTANetworkAPI;

/// <summary>RAGE-MP compatible Vehicle wrapper around a CitizenFX vehicle handle.</summary>
public sealed class Vehicle
{
    public int Handle { get; }
    internal Vehicle(int handle) { Handle = handle; }

    // ── Spatial ────────────────────────────────────────────────────────────
    public Vector3 Position
    {
        get { var c = CFXAPI.GetEntityCoords(Handle); return new Vector3(c.X, c.Y, c.Z); }
        set => CFXAPI.SetEntityCoords(Handle, value.X, value.Y, value.Z, false, false, false, false);
    }
    public float Heading
    {
        get => CFXAPI.GetEntityHeading(Handle);
        set => CFXAPI.SetEntityHeading(Handle, value);
    }
    public Vector3 Velocity
    {
        get { var v = CFXAPI.GetEntityVelocity(Handle); return new Vector3(v.X, v.Y, v.Z); }
        set => CFXAPI.SetEntityVelocity(Handle, value.X, value.Y, value.Z);
    }

    // ── Cosmetic ───────────────────────────────────────────────────────────
    public int    PrimaryColor   { get; set; }     // TODO map to SetVehicleColours
    public int    SecondaryColor { get; set; }
    public string NumberPlate
    {
        get => CFXAPI.GetVehicleNumberPlateText(Handle) ?? "";
        set => CFXAPI.SetVehicleNumberPlateText(Handle, value);
    }

    // ── Engine / state ─────────────────────────────────────────────────────
    public bool EngineStatus
    {
        get => CFXAPI.GetIsVehicleEngineRunning(Handle);
        set => CFXAPI.SetVehicleEngineOn(Handle, value, true, true);
    }
    public float Health
    {
        get => CFXAPI.GetVehicleBodyHealth(Handle);
        set => CFXAPI.SetVehicleBodyHealth(Handle, value);
    }
    public float Fuel { get; set; }                  // RAGE custom field — track in dictionary if game logic needs it

    public int Dimension
    {
        get => CFXAPI.GetEntityRoutingBucket(Handle);
        set => CFXAPI.SetEntityRoutingBucket(Handle, value);
    }

    public Player? Driver
    {
        get
        {
            var ped = CFXAPI.GetPedInVehicleSeat(Handle, -1);
            if (ped == 0) return null;
            // Find player whose ped == this ped
            return Player.Pool.All().FirstOrDefault(p => CFXAPI.GetPlayerPed(p.Id.ToString()) == ped);
        }
    }

    public void Delete()
    {
        CFXAPI.DeleteEntity(Handle);
        Pool._registry.TryRemove(Handle, out _);
    }

    // ── Factory ────────────────────────────────────────────────────────────
    internal static Vehicle Create(uint modelHash, Vector3 pos, float heading,
        int color1, int color2, string? plate, int dimension)
    {
        var h = CFXAPI.CreateVehicle((int)modelHash, pos.X, pos.Y, pos.Z, heading, true, true);
        var v = new Vehicle(h)
        {
            PrimaryColor   = color1,
            SecondaryColor = color2,
            Dimension      = dimension,
        };
        if (plate != null) v.NumberPlate = plate;
        Pool._registry[h] = v;
        return v;
    }

    public static class Pool
    {
        internal static readonly ConcurrentDictionary<int, Vehicle> _registry = new();

        public static IReadOnlyCollection<Vehicle> All() => _registry.Values.ToArray();
        internal static Vehicle Wrap(int handle) => _registry.GetOrAdd(handle, h => new Vehicle(h));
    }
}
