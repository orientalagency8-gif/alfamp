// SPDX-License-Identifier: MIT
// Drop-in example: this file is VALID RAGE-MP C# and ALSO compiles on Alfa MP
// because AlfaMP.RageMP.Compat provides identical surface.
//
// Run on RAGE MP: works.
// Run on Alfa MP (with `AlfaMP.RageMP.Compat` NuGet referenced): also works.

using System.Numerics;
using GTANetworkAPI;

namespace HelloWorld;

public class HelloWorld : Script
{
    [ServerEvent(Event.PlayerConnected)]
    public void OnPlayerJoined(Player player)
    {
        player.SendNotification($"~g~Welcome to ~w~Alfa MP, {player.Name}!");
        player.SendChatMessage("Type /spawn to spawn at the start point.");

        NAPI.Player.SendChatMessageToAll($"{player.Name} joined the server.");
    }

    [ServerEvent(Event.PlayerDisconnected)]
    public void OnPlayerLeft(Player player)
    {
        NAPI.Player.SendChatMessageToAll($"{player.Name} left the server.");
    }

    [RemoteEvent("requestSpawn")]
    public void OnRequestSpawn(Player player)
    {
        player.Position = new Vector3(-1037.0f, -2737.0f, 20.0f);   // LSIA
        player.SendNotification("~b~Spawned at LSIA.");
    }

    [RemoteEvent("spawnCar")]
    public void OnSpawnCar(Player player, string model)
    {
        var v = NAPI.Vehicle.Create(model, player.Position + new Vector3(3, 0, 0), player.Heading);
        v.NumberPlate = "ALFA-MP";
        player.WarpIntoVehicle(v);
        player.SendNotification($"~y~Spawned {model}.");
    }
}
