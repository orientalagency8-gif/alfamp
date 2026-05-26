// SPDX-License-Identifier: MIT
using System.Collections.Concurrent;
using System.Numerics;

namespace GTANetworkAPI;

/// <summary>RAGE-MP compatible Blip — map marker. Synced to clients via NUI event channel.</summary>
public sealed class Blip
{
    public int    Id        { get; }
    public Vector3 Position { get; set; }
    public int    Sprite    { get; set; } = 1;
    public int    Color     { get; set; } = 1;
    public float  Scale     { get; set; } = 1.0f;
    public string Name      { get; set; } = "Blip";
    public bool   ShortRange { get; set; } = false;
    public int    Dimension { get; set; } = 0;

    internal Blip() { Id = System.Threading.Interlocked.Increment(ref Pool._nextId); Pool._all[Id] = this; Broadcast("create"); }

    public void Delete() { Pool._all.TryRemove(Id, out _); Broadcast("delete"); }

    private void Broadcast(string action)
        => NAPI.TriggerClientEventForAll("__rageCompat:blip", action, new {
            id = Id, x = Position.X, y = Position.Y, z = Position.Z,
            sprite = Sprite, color = Color, scale = Scale, name = Name,
            shortRange = ShortRange, dimension = Dimension
        });

    public static class Pool
    {
        internal static int _nextId;
        internal static readonly ConcurrentDictionary<int, Blip> _all = new();
        public static IReadOnlyCollection<Blip> All() => _all.Values.ToArray();
        public static Blip Create(int sprite, Vector3 pos, float scale = 1.0f, int color = 1, string name = "Blip", bool shortRange = false, int dim = 0)
            => new() { Sprite = sprite, Position = pos, Scale = scale, Color = color, Name = name, ShortRange = shortRange, Dimension = dim };
    }
}

/// <summary>3D marker (cylinder / arrow / etc) at a world position.</summary>
public sealed class Marker
{
    public int    Id        { get; }
    public int    Type      { get; set; } = 1;
    public Vector3 Position { get; set; }
    public float  Scale     { get; set; } = 1f;
    public int    Color     { get; set; } = unchecked((int)0xFFD63A51);
    public int    Dimension { get; set; }

    internal Marker() { Id = System.Threading.Interlocked.Increment(ref Pool._nextId); Pool._all[Id] = this; Broadcast("create"); }
    public void Delete() { Pool._all.TryRemove(Id, out _); Broadcast("delete"); }

    private void Broadcast(string action)
        => NAPI.TriggerClientEventForAll("__rageCompat:marker", action, new {
            id = Id, type = Type, x = Position.X, y = Position.Y, z = Position.Z,
            scale = Scale, color = Color, dimension = Dimension
        });

    public static class Pool
    {
        internal static int _nextId;
        internal static readonly ConcurrentDictionary<int, Marker> _all = new();
        public static Marker Create(int type, Vector3 pos, float scale = 1f, int color = unchecked((int)0xFFD63A51), int dim = 0)
            => new() { Type = type, Position = pos, Scale = scale, Color = color, Dimension = dim };
    }
}

/// <summary>2D text-label floating in world space.</summary>
public sealed class TextLabel
{
    public int    Id        { get; }
    public string Text      { get; set; } = "";
    public Vector3 Position { get; set; }
    public float  Distance  { get; set; } = 20f;
    public int    Color     { get; set; } = unchecked((int)0xFFFFFFFF);
    public int    Dimension { get; set; }

    internal TextLabel() { Id = System.Threading.Interlocked.Increment(ref Pool._nextId); Pool._all[Id] = this; Broadcast("create"); }
    public void Delete() { Pool._all.TryRemove(Id, out _); Broadcast("delete"); }
    private void Broadcast(string action)
        => NAPI.TriggerClientEventForAll("__rageCompat:label", action, new {
            id = Id, text = Text, x = Position.X, y = Position.Y, z = Position.Z,
            distance = Distance, color = Color, dimension = Dimension
        });

    public static class Pool
    {
        internal static int _nextId;
        internal static readonly ConcurrentDictionary<int, TextLabel> _all = new();
        public static TextLabel Create(string text, Vector3 pos, float distance = 20f, int color = unchecked((int)0xFFFFFFFF), int dim = 0)
            => new() { Text = text, Position = pos, Distance = distance, Color = color, Dimension = dim };
    }
}
