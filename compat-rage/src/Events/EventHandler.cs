// SPDX-License-Identifier: MIT
// Maps RAGE-MP's attribute-based event subscription model to CitizenFX events.
//
//    [ServerEvent(Event.PlayerConnected)]
//    public void OnPlayerConnected(Player p) { ... }
//
// In RAGE-MP this is auto-discovered by the runtime. We do the same — at
// resource load we scan all loaded assemblies for [ServerEvent(...)] methods
// and bridge them to the equivalent CFX EventHandler.

using System.Reflection;
using CFX = CitizenFX.Core;

namespace GTANetworkAPI;

/// <summary>RAGE-MP server event enum — values are the CFX event names we bridge to.</summary>
public enum Event
{
    PlayerConnected,
    PlayerDisconnected,
    PlayerDeath,
    PlayerSpawn,
    PlayerChat,
    PlayerEnterVehicle,
    PlayerExitVehicle,
    PlayerStartEnterVehicle,
    PlayerKeyDown,
    PlayerKeyUp,
    ResourceStart,
    ResourceStop,
    Update,
}

[AttributeUsage(AttributeTargets.Method)]
public sealed class ServerEventAttribute : Attribute
{
    public Event Type { get; }
    public ServerEventAttribute(Event type) { Type = type; }
}

[AttributeUsage(AttributeTargets.Method)]
public sealed class RemoteEventAttribute : Attribute
{
    public string Name { get; }
    public RemoteEventAttribute(string name) { Name = name; }
}

/// <summary>Base class RAGE-MP resources inherit from — same name & semantics so [Script] gamemodes keep compiling.</summary>
public abstract class Script
{
    protected Script()
    {
        Compat.EventBridge.Register(this);
    }
}

internal static class EventBridge
{
    private static readonly Dictionary<Event, string> CfxNames = new()
    {
        { Event.PlayerConnected,         "playerJoining" },
        { Event.PlayerDisconnected,      "playerDropped" },
        { Event.PlayerDeath,             "baseevents:onPlayerDied" },
        { Event.PlayerSpawn,             "playerSpawned" },
        { Event.PlayerChat,              "chatMessage" },
        { Event.PlayerEnterVehicle,      "baseevents:enteredVehicle" },
        { Event.PlayerExitVehicle,       "baseevents:leftVehicle" },
        { Event.PlayerStartEnterVehicle, "baseevents:enteringVehicle" },
        { Event.ResourceStart,           "onResourceStart" },
        { Event.ResourceStop,            "onResourceStop" },
        // Update / KeyDown / KeyUp are client-driven — we wire them via custom NUI bridge resources later.
    };

    public static void Register(Script instance)
    {
        var t = instance.GetType();
        foreach (var m in t.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
        {
            var sea = m.GetCustomAttribute<ServerEventAttribute>();
            if (sea != null && CfxNames.TryGetValue(sea.Type, out var cfxName))
            {
                CFX.Native.API.AddEventHandler(cfxName, new Action<dynamic>(args => InvokeSafe(instance, m, args)));
                CFX.Debug.WriteLine($"[compat] {t.Name}.{m.Name}  ←  {sea.Type} ({cfxName})");
            }
            var rea = m.GetCustomAttribute<RemoteEventAttribute>();
            if (rea != null)
            {
                CFX.Native.API.AddEventHandler(rea.Name, new Action<dynamic>(args => InvokeSafe(instance, m, args)));
                CFX.Debug.WriteLine($"[compat] {t.Name}.{m.Name}  ←  RemoteEvent({rea.Name})");
            }
        }
    }

    private static void InvokeSafe(object inst, MethodInfo m, dynamic args)
    {
        try { m.Invoke(inst, MapArgs(m, args)); }
        catch (Exception e) { CFX.Debug.WriteLine($"[compat] handler {m.Name} threw: {e.Message}"); }
    }

    private static object?[] MapArgs(MethodInfo m, dynamic args)
    {
        // Naive mapping: if handler expects (Player), look up source. Real bridge will be richer.
        var pars = m.GetParameters();
        if (pars.Length == 0) return Array.Empty<object?>();
        if (pars[0].ParameterType == typeof(Player))
        {
            // CFX hands us the source via the implicit "source" — TODO read from globals
            // For now, args[0] in playerJoining/playerDropped is typically the source id.
            return new object?[] { Player.Pool.Find(0) };
        }
        return new object?[] { args };
    }
}

// Internal namespace alias so user code stays clean.
namespace Compat { internal static class EventBridge { public static void Register(GTANetworkAPI.Script s) => GTANetworkAPI.EventBridge.Register(s); } }
