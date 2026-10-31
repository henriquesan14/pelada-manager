using System.Text.Json;
using Pelada.Api;
using Xunit;

namespace Pelada.Tests;

public sealed class PlayerProfileTests
{
    [Theory]
    [InlineData(0.5)] [InlineData(1)] [InlineData(1.5)] [InlineData(2.5)] [InlineData(3.5)] [InlineData(4.5)] [InlineData(5)]
    public void AcceptsHalfStarRatings(double rating)
    {
        var state = new PeladaState();
        PeladaRules.Apply(state, new() { Type = "addPlayer", Name = "Ana", Level = (decimal)rating, Position = "Meia" }, "u", "User", false);
        Assert.Equal((decimal)rating, state.Players.Single().Level);
        Assert.Equal("Meia", state.Players.Single().Position);
    }
    [Theory]
    [InlineData(0)] [InlineData(-0.5)] [InlineData(0.75)] [InlineData(1.2)] [InlineData(5.5)]
    public void RejectsRatingsOutsideTheScale(double rating)
    {
        var state = new PeladaState();
        Assert.Throws<ApiError>(() => PeladaRules.Apply(state, new() { Type = "addPlayer", Name = "Ana", Level = (decimal)rating, Position = "Meia" }, "u", "User", false));
        Assert.Empty(state.Players);
    }
    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("posição inventada")]
    public void NewPlayersRequireAKnownPosition(string? position)
    {
        Assert.Throws<ApiError>(() => PeladaRules.Apply(new(), new() { Type = "addPlayer", Name = "Ana", Level = 3.5m, Position = position }, "u", "User", false));
    }
    [Fact]
    public void EveryListedPositionCanBeRegistered()
    {
        var state = new PeladaState();
        foreach (var position in PeladaRules.Positions)
            PeladaRules.Apply(state, new() { Type = "addPlayer", Name = position, Level = 2.5m, Position = position }, "u", "User", false);
        Assert.Equal(PeladaRules.Positions.Length, state.Players.Count);
    }
    [Fact]
    public void ExistingPlayersKeepTheirRatingsAndCanReceiveAPosition()
    {
        const string json = """{"players":[{"id":"a","name":"Ana","level":3}],"teams":[],"matches":[]}""";
        var state = JsonSerializer.Deserialize<PeladaState>(json, PeladaRules.Json)!;
        Assert.Equal(3m, state.Players.Single().Level);
        Assert.Null(state.Players.Single().Position);
        PeladaRules.Apply(state, new() { Type = "updatePosition", Id = "a", Position = "Goleiro" }, "u", "User", false);
        PeladaRules.Apply(state, new() { Type = "updateLevel", Id = "a", Level = 4.5m }, "u", "User", false);
        Assert.Equal("Goleiro", state.Players.Single().Position);
        Assert.Equal(4.5m, state.Players.Single().Level);
    }
    [Fact]
    public void DrawAndBackupPreserveHalfStarsAndPositions()
    {
        var players = new List<Player> { new("a", "Ana", 4.5m, "Meia"), new("b", "Beto", 4.5m, "Lateral"), new("c", "Caio", 0.5m, "Atacante"), new("d", "Dani", 0.5m, "Zagueiro") };
        var teams = PeladaRules.Draw(players, 2, new Random(42));
        Assert.All(teams, t => Assert.Equal(5m, t.Strength));
        var source = new PeladaState { Players = players };
        var imported = JsonSerializer.Deserialize<PeladaState>(JsonSerializer.Serialize(source, PeladaRules.Json), PeladaRules.Json)!;
        var target = new PeladaState();
        PeladaRules.Apply(target, new() { Type = "importLegacy", Data = imported }, "u", "User", true);
        Assert.Equal(players, target.Players);
    }
}
