using System.Text.Json;
using Pelada.Api;
using Xunit;

namespace Pelada.Tests;

public sealed class RentalLifecycleTests
{
    private static PeladaState State() => new() { Players=[new("p1","Ana",3),new("p2","Beto",3),new("p3","Caio",3)],
        Teams=[new("a","A",["p1"],3),new("b","B",["p2"],3),new("c","C",["p3"],3)] };
    private static void Act(PeladaState state,ActionRequest input)=>PeladaRules.Apply(state,input,"u","Organizador",true);
    private static string Start(PeladaState state,bool withPhoto=true){Act(state,new(){Type="startRental",Name="Sábado",PlayedOn=new DateOnly(2026,10,30)});if(withPhoto)state.Rentals[^1]=state.Rentals[^1] with{PhotoId="stored-photo"};return state.Rentals[^1].Id;}
    [Fact]
    public void CancellationNeedsNoPhotoAndReleasesTheNextRegistrationWithoutChangingTheDraft()
    {
        var state=State();var id=Start(state,false);
        Act(state,new(){Type="draw",Players=["p1","p3"],Count=2});
        var draft=JsonSerializer.Serialize(state.Teams,PeladaRules.Json);
        Act(state,new(){Type="cancelRental",RentalId=id});
        var cancelled=state.Rentals.Single();
        Assert.NotNull(cancelled.CancelledAt);Assert.Equal(cancelled.CancelledAt,cancelled.FinishedAt);
        Assert.Null(cancelled.WinnerTeamId);Assert.Equal(3,cancelled.Teams.Count);
        Assert.Equal(draft,JsonSerializer.Serialize(state.Teams,PeladaRules.Json));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="cancelRental",RentalId=id}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="a"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="reopenRental",RentalId=id}));
        Start(state,false);Assert.Equal(2,state.Rentals.Count);
        Assert.Null(state.Rentals[1].CancelledAt);
    }
    [Fact]
    public void ThreeDrawOptionsAreSharedAndOnlyTheChosenTeamsAreRegistered()
    {
        var state=State();
        state.Players = Enumerable.Range(1,12).Select(i=>new Player($"p{i}",$"Jogador {i}",i%5+0.5m)).ToList();
        var players=state.Players.Select(p=>p.Id).ToList();
        Act(state,new(){Type="generateDrawOptions",Players=players,Count=3});
        Assert.Equal(3,state.DrawOptions.Count);Assert.Empty(state.Teams);Assert.Null(state.SelectedDrawOptionId);
        foreach(var option in state.DrawOptions)
        {
            Assert.Equal(3,option.Teams.Count);
            Assert.Equal(players.Order(),option.Teams.SelectMany(t=>t.Players).Order());
        }
        Assert.Throws<ApiError>(()=>Start(state,false));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="selectDrawOption",Id="stale"}));
        var chosen=state.DrawOptions[1];Act(state,new(){Type="selectDrawOption",Id=chosen.Id});
        Assert.Equal(chosen.Id,state.SelectedDrawOptionId);
        Assert.NotSame(chosen.Teams[0].Players,state.Teams[0].Players);
        Start(state,false);
        Assert.Equal(chosen.Teams.Select(t=>t.Id),state.Rentals.Single().Teams.Select(t=>t.Id));
        Assert.Empty(state.DrawOptions);Assert.Null(state.SelectedDrawOptionId);
        Act(state,new(){Type="generateDrawOptions",Players=players,Count=4});
        Act(state,new(){Type="selectDrawOption",Id=state.DrawOptions[0].Id});
        Act(state,new(){Type="generateDrawOptions",Players=players,Count=3});
        Assert.Empty(state.Teams);Assert.Null(state.SelectedDrawOptionId);
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="generateDrawOptions",Players=players,Count=2}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="generateDrawOptions",Players=["p1","p2"],Count=3}));
    }
    [Fact]
    public void CancellingDrawOptionsKeepsTheRegisteredRental()
    {
        var state = State();
        Start(state, false);
        var registered = state.Rentals.Single();
        Act(state, new() { Type = "generateDrawOptions", Players = ["p1", "p2", "p3"], Count = 3 });
        var optionId = state.DrawOptions[0].Id;
        Act(state, new() { Type = "selectDrawOption", Id = optionId });

        Act(state, new() { Type = "cancelDrawOptions" });

        Assert.Empty(state.DrawOptions);
        Assert.Empty(state.Teams);
        Assert.Null(state.SelectedDrawOptionId);
        Assert.Same(registered, state.Rentals.Single());
        Assert.Throws<ApiError>(() => Act(state, new() { Type = "selectDrawOption", Id = optionId }));
    }

    [Fact]
    public void SelectedGoalkeepersCanPlayInTheDrawAndWinnerMustExist()
    {
        var state=State();state.Players.Add(new("g1","TARCIO (GL)",5));state.Players.Add(new("g2","Veto (gl) ",4));
        var selected=state.Players.Select(p=>p.Id).ToList();
        Act(state,new(){Type="generateDrawOptions",Players=selected,Count=3});
        Assert.All(state.DrawOptions,o=>Assert.Equal(selected.OrderBy(id=>id),o.Teams.SelectMany(t=>t.Players).OrderBy(id=>id)));
        Act(state,new(){Type="generateDrawOptions",Players=selected.Where(id=>id!="g2").ToList(),Count=3});
        Assert.All(state.DrawOptions,o=>{Assert.Contains("g1",o.Teams.SelectMany(t=>t.Players));Assert.DoesNotContain("g2",o.Teams.SelectMany(t=>t.Players));});
        Act(state,new(){Type="selectDrawOption",Id=state.DrawOptions[0].Id});
        var id=Start(state);var winner=state.Rentals[0].Teams[0].Id;
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId=winner}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId=winner,WinningGoalkeeperId="missing"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="finishRental",RentalId=id,NoWinner=true,WinningGoalkeeperId="g1"}));
        Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId=winner,WinningGoalkeeperId="g1"});
        Assert.Equal("g1",state.Rentals[0].WinningGoalkeeperId);
        Act(state,new(){Type="reopenRental",RentalId=id});Assert.Null(state.Rentals[0].WinningGoalkeeperId);
        Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId=winner,WinningGoalkeeperId="p1"});
        Assert.Equal("p1",state.Rentals[0].WinningGoalkeeperId);
        Act(state,new(){Type="reopenRental",RentalId=id});
        Act(state,new(){Type="finishRental",RentalId=id,NoWinner=true});Assert.Null(state.Rentals[0].WinningGoalkeeperId);
    }
    [Fact]
    public void HistoricalRecordsKeepInitialBalancesWithoutFabricatingTeamsOrWinner()
    {
        var data=State();data.Teams=[];
        data.Players[0]=data.Players[0] with{InitialRentals=20};
        var date=DateTimeOffset.UtcNow;
        data.Rentals=[new Rental("historical","Pelada antiga",date,[],FinishedAt:date,IsHistorical:true,
            ParticipantsText:"Ana, Beto e convidados",SourcePhotoUrl:"https://example.com/photo.png")];
        var target=new PeladaState();Act(target,new(){Type="importLegacy",Data=data});
        Assert.Equal(20,target.Players[0].InitialRentals);Assert.Empty(target.Rentals[0].Teams);
        Assert.Null(target.Rentals[0].WinnerTeamId);
        Assert.Throws<ApiError>(()=>Act(target,new(){Type="reopenRental",RentalId="historical"}));
        data.Players[0]=data.Players[0] with{InitialRentals=-1};
        Assert.Throws<ApiError>(()=>Act(new(),new(){Type="importLegacy",Data=data}));
    }
    [Fact]
    public void DeleteRemovesOnlyThatRentalAndKeepsInitialTotalsAndDraft()
    {
        var state=State();state.Players[0]=state.Players[0] with{InitialRentals=20};
        var id=Start(state);Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="a"});
        Act(state,new(){Type="draw",Players=["p1","p2","p3"],Count=3});
        var other=Start(state,false);var draft=JsonSerializer.Serialize(state.Teams,PeladaRules.Json);
        state.Matches.Add(new("old",DateTimeOffset.UtcNow,["p1"],["p2"],"A","B",1,0,"u","User",id,"a","b"));
        Act(state,new(){Type="deleteRental",RentalId=id});
        Assert.Equal(other,state.Rentals.Single().Id);Assert.Empty(state.Matches);
        Assert.Equal(20,state.Players[0].InitialRentals);Assert.Equal(draft,JsonSerializer.Serialize(state.Teams,PeladaRules.Json));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="deleteRental",RentalId=id}));
        Act(state,new(){Type="deleteRental",RentalId=other});Assert.Empty(state.Rentals);
    }
    [Fact]
    public void CompletedResultsCannotBeCancelled()
    {
        var state=State();var id=Start(state);
        Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="a"});
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="cancelRental",RentalId=id}));
        Assert.Equal("a",state.Rentals.Single().WinnerTeamId);
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="cancelRental",RentalId="missing"}));
    }
    [Fact]
    public void OrganizerChoosesWinnerWithoutRegisteringAnyMatches()
    {
        var state=State();var id=Start(state);
        Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="c"});
        Assert.Empty(state.Matches);Assert.Equal("c",state.Rentals.Single().WinnerTeamId);
        Assert.NotNull(state.Rentals.Single().FinishedAt);
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="c"}));
    }
    [Fact]
    public void PhotoAndExplicitWinnerChoiceAreRequired()
    {
        var state=State();var id=Start(state,false);
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="a"}));
        state.Rentals[0]=state.Rentals[0] with{PhotoId="stored-photo"};
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="finishRental",RentalId=id}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="unknown"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="a",NoWinner=true}));
        Assert.Null(state.Rentals.Single().FinishedAt);
    }
    [Fact]
    public void NoWinnerCanBeSavedExplicitly()
    {
        var state=State();var id=Start(state);
        Act(state,new(){Type="finishRental",RentalId=id,NoWinner=true});
        Assert.Null(state.Rentals.Single().WinnerTeamId);Assert.NotNull(state.Rentals.Single().FinishedAt);
    }
    [Fact]
    public void ExistingMatchScoresDoNotOverrideTheChosenWinner()
    {
        var state=State();var id=Start(state);
        state.Matches.Add(new("m",DateTimeOffset.UtcNow,["p1"],["p2"],"A","B",9,0,"u","User",id,"a","b"));
        Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="b"});
        Assert.Equal("b",state.Rentals.Single().WinnerTeamId);Assert.Single(state.Matches);
    }
    [Fact]
    public void RegisteredParticipantsCannotBeDeleted()
    {
        var state=State();Start(state);
        Assert.Throws<ApiError>(()=>Start(state));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="removePlayer",Id="p1"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="addMatch"}));
    }
    [Fact]
    public void DraftDrawDoesNotChangeRegisteredTeamsOrDate()
    {
        var state=State();Start(state);
        var before=JsonSerializer.Serialize(state.Rentals,PeladaRules.Json);
        for(var i=0;i<2;i++)
        {
            Act(state,new(){Type="draw",Players=["p1","p3"],Count=2});
            Assert.Equal(new[]{"p1","p3"},state.Teams.SelectMany(t=>t.Players).Order().ToArray());
            Assert.Equal(before,JsonSerializer.Serialize(state.Rentals,PeladaRules.Json));
        }
    }
    [Fact]
    public void RegistrationRequiresDateAndSavesTheApprovedDraw()
    {
        var state=State();
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="startRental",Name="Sábado"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="startRental",Name="Sábado",PlayedOn=new DateOnly(2026,11,7),Location=new string('a',121)}));
        Act(state,new(){Type="startRental",Name="Sábado",PlayedOn=new DateOnly(2026,11,7),Location=" Arena Central "});
        var rental=state.Rentals.Single();
        Assert.Equal(new DateOnly(2026,11,7),rental.PlayedOn);
        Assert.Equal("Arena Central",rental.Location);
        Assert.Equal(3,rental.Teams.Count);Assert.Empty(state.Teams);
        Assert.Null(rental.FinishedAt);Assert.Null(rental.WinnerTeamId);
        Assert.Equal(rental.PlayedOn,JsonSerializer.Deserialize<Rental>(JsonSerializer.Serialize(rental,PeladaRules.Json),PeladaRules.Json)!.PlayedOn);
    }
    [Fact]
    public void CorrectingWinnerKeepsPhotoAndReplacesThePreviousWinner()
    {
        var state=State();var id=Start(state);
        Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="a"});
        Act(state,new(){Type="reopenRental",RentalId=id});
        Assert.Null(state.Rentals.Single().WinnerTeamId);Assert.Null(state.Rentals.Single().FinishedAt);
        Assert.Equal("stored-photo",state.Rentals.Single().PhotoId);
        Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="b"});
        Assert.Equal("b",state.Rentals.Single().WinnerTeamId);
    }
    [Fact]
    public void NewRentalDoesNotInheritWinnerOrPhoto()
    {
        var state=State();var first=Start(state);Act(state,new(){Type="finishRental",RentalId=first,WinnerTeamId="a"});
        Act(state,new(){Type="draw",Players=["p1","p2","p3"],Count=3});
        Start(state,false);
        Assert.Null(state.Rentals.Last().WinnerTeamId);Assert.Null(state.Rentals.Last().PhotoId);
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="reopenRental",RentalId=first}));
    }
    [Fact]
    public void JsonBackupKeepsWinnersButDoesNotCreateBrokenPhotoReferences()
    {
        var state=State();var id=Start(state);Act(state,new(){Type="finishRental",RentalId=id,WinnerTeamId="a"});
        var copy=JsonSerializer.Deserialize<PeladaState>(JsonSerializer.Serialize(state,PeladaRules.Json),PeladaRules.Json)!;
        var target=new PeladaState();Act(target,new(){Type="importLegacy",Data=copy});
        Assert.Equal("a",target.Rentals.Single().WinnerTeamId);Assert.Null(target.Rentals.Single().PhotoId);
        copy.Rentals[0]=copy.Rentals[0] with{WinnerTeamId="unknown"};
        Assert.Throws<ApiError>(()=>Act(new(),new(){Type="importLegacy",Data=copy}));
    }
}
