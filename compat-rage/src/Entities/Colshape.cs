// SPDX-License-Identifier: MIT
using System.Collections.Concurrent;
using System.Numerics;
using CFXAPI = CitizenFX.Core.Native.API;

namespace GTANetworkAPI;

/// <summary>RAGE-MP compatible Colshape: trigger events when a player enters/leaves a 3D zone.</summary>
public abstract class Colshape
{
    public int Id { get; }
    public int Dimension { get; set; }
    internal Colshape() { Id = System.Threading.Interlocked.Increment(ref Pool._nextId); Pool._all[Id] = this; }

    public abstract bool ContainsPoint(Vector3 p);

    public delegate void EnterHandler(Colshape shape, Player player);
    public event EnterHandler? OnEntityEnterColShape;
    public event EnterHandler? OnEntityExitColShape;

    private readonly HashSet<int> _inside = new();
    internal void Tick()
    {
        foreach (var p in Player.Pool.All())
        {
            var was = _inside.Contains(p.Id);
            var now = ContainsPoint(p.Position) && p.Dimension == Dimension;
            if (now && !was) { _inside.Add(p.Id); OnEntityEnterColShape?.Invoke(this, p); }
            else if (!now && was) { _inside.Remove(p.Id); OnEntityExitColShape?.Invoke(this, p); }
        }
    }

    public void Delete() { Pool._all.TryRemove(Id, out _); }

    public static class Pool
    {
        internal static int _nextId;
        internal static readonly ConcurrentDictionary<int, Colshape> _all = new();
        public static IReadOnlyCollection<Colshape> All() => _all.Values.ToArray();
        static Pool()
        {
            // 4 Hz colshape tick — light enough to never matter for perf.
            var t = new System.Threading.Timer(_ => { foreach (var s in _all.Values) try { s.Tick(); } catch {} },
                null, 250, 250);
        }
    }
}

public sealed class SphereColshape : Colshape
{
    public Vector3 Center { get; }
    public float Radius { get; }
    public SphereColshape(Vector3 center, float radius, int dimension = 0)
    { Center = center; Radius = radius; Dimension = dimension; }
    public override bool ContainsPoint(Vector3 p) => Vector3.Distance(Center, p) <= Radius;
}

public sealed class CuboidColshape : Colshape
{
    public Vector3 Min { get; }
    public Vector3 Max { get; }
    public CuboidColshape(Vector3 corner1, Vector3 corner2, int dimension = 0)
    {
        Min = Vector3.Min(corner1, corner2);
        Max = Vector3.Max(corner1, corner2);
        Dimension = dimension;
    }
    public override bool ContainsPoint(Vector3 p)
        => p.X >= Min.X && p.X <= Max.X && p.Y >= Min.Y && p.Y <= Max.Y && p.Z >= Min.Z && p.Z <= Max.Z;
}
