using System.Text.Json;
using Pelada.Api;
using Xunit;

namespace Pelada.Tests;

public sealed class DomainTests
{
    [Theory]
    [InlineData(13, 3)]
    [InlineData(12, 2)]
    [InlineData(6, 6)]
    public void DrawDistributesEveryoneWithoutDuplicates(int count, int teams)
    {
        var players = Enumerable.Range(0, count).Select(i => new Player($"p{i}", $"Jogador {i}", i % 5 + 1)).ToList();
        var result = PeladaRules.Draw(players, teams, new Random(42));
        Assert.Equal(count, result.Sum(t => t.Players.Count));
        Assert.Equal(count, result.SelectMany(t => t.Players).Distinct().Count());
        Assert.InRange(result.Max(t => t.Players.Count) - result.Min(t => t.Players.Count), 0, 1);
        Assert.Equal(players.Sum(p => p.Level), result.Sum(t => t.Strength));
    }
    [Fact]
    public void DrawBalancesDifferentLevels()
    {
        var players = new[] {5, 5, 4, 4, 3, 3, 2, 2, 1, 1}.Select((n,i) => new Player($"p{i}", $"P{i}", n)).ToList();
        var teams = PeladaRules.Draw(players, 2, new Random(10));
        Assert.Equal(teams[0].Strength, teams[1].Strength);
    }
    [Fact]
    public void CannotDrawWithInsufficientPlayers() => Assert.Throws<ApiError>(() => PeladaRules.Draw([new Player("a", "Ana", 3)], 2));
    [Fact]
    public void RentalKeepsParticipantsAndWinnerAfterANewDraw()
    {
        var state = new PeladaState { Players = [new("a", "Ana", 3), new("b", "Beto", 4)] };
        PeladaRules.Apply(state, new() { Type = "draw", Players = ["a", "b"], Count = 2 }, "owner", "Dono", true);
        PeladaRules.Apply(state, new() { Type = "startRental", Name = "Sábado", PlayedOn = new DateOnly(2026,10,30) }, "owner", "Dono", true);
        var rentalId = state.Rentals.Single().Id;
        var ids = state.Rentals.Single().Teams.Select(t => t.Id).ToArray();
        state.Rentals[0] = state.Rentals[0] with { PhotoId = "stored-photo" };
        PeladaRules.Apply(state, new() { Type = "finishRental", RentalId = rentalId, WinnerTeamId = ids[0] }, "owner", "Dono", true);
        PeladaRules.Apply(state, new() { Type = "draw", Players = ["a", "b"], Count = 2 }, "owner", "Dono", true);
        Assert.Equal(ids[0], state.Rentals[0].WinnerTeamId);
        Assert.Equal(2, state.Rentals[0].Teams.SelectMany(t => t.Players).Distinct().Count());
        Assert.DoesNotContain(state.Teams, t => ids.Contains(t.Id));
    }
    [Theory]
    [InlineData(-1, 0)]
    [InlineData(0, 1000)]
    public void InvalidScoresDoNotCreateMatches(int scoreA, int scoreB)
    {
        var state = new PeladaState { Teams = [new("a", "A", ["1"], 3), new("b", "B", ["2"], 3)] };
        PeladaRules.Apply(state, new() { Type = "startRental", Name = "Sábado", PlayedOn = new DateOnly(2026,10,30) }, "u", "User", false);
        Assert.Throws<ApiError>(() => PeladaRules.Apply(state, new() { Type = "addMatch", RentalId = state.Rentals.Single().Id, A = "a", B = "b", ScoreA = scoreA, ScoreB = scoreB }, "u", "User", false));
        Assert.Empty(state.Matches);
    }
    [Fact]
    public void BackupImportIsOwnerOnlyAndCannotReplaceExistingData()
    {
        const string json = """{"type":"importLegacy","data":{"players":[{"id":"a","name":"Ana","level":3}],"matches":[],"teams":[]}}""";
        var action = JsonSerializer.Deserialize<ActionRequest>(json, PeladaRules.Json)!;
        var state = new PeladaState();
        Assert.Equal(403, Assert.Throws<ApiError>(() => PeladaRules.Apply(state, action, "u", "User", false)).Status);
        PeladaRules.Apply(state, action, "u", "User", true);
        Assert.Equal("Ana", state.Players.Single().Name);
        Assert.Equal(409, Assert.Throws<ApiError>(() => PeladaRules.Apply(state, action, "u", "User", true)).Status);
    }
}
