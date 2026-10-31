using Pelada.Api;
using Xunit;
namespace Pelada.Tests;
public sealed class PlayerSuspensionTests
{
    private static PeladaState State()=>new(){Players=[new("p1","Ana",3),new("p2","Beto",3),new("p3","Caio",3),new("p4","Dani",3)]};
    private static void Act(PeladaState state,ActionRequest input)=>PeladaRules.Apply(state,input,"u","Organizador",true);
    private static DateOnly Today()=>DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTimeOffset.UtcNow,"America/Sao_Paulo").DateTime);
    [Fact]
    public void DateSuspensionIsInclusiveBlocksDraftAndCanBeCleared()
    {
        var state=State();Act(state,new(){Type="generateDrawOptions",Players=["p1","p2","p3"],Count=3});
        Act(state,new(){Type="suspendPlayer",Id="p1",SuspensionUntil=Today().AddDays(2)});
        Assert.Empty(state.DrawOptions);Assert.Empty(state.Teams);
        Assert.True(PeladaRules.IsSuspended(state.Players[0],state,Today().AddDays(2)));
        Assert.False(PeladaRules.IsSuspended(state.Players[0],state,Today().AddDays(3)));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="generateDrawOptions",Players=["p1","p2","p3"],Count=3}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="draw",Players=["p1","p2"],Count=2}));
        state.Teams=[new("a","A",["p1"],3),new("b","B",["p2"],3)];
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="startRental",Name="Pelada",PlayedOn=Today()}));
        Act(state,new(){Type="clearPlayerSuspension",Id="p1"});Assert.False(PeladaRules.IsSuspended(state.Players[0],state));
        Act(state,new(){Type="generateDrawOptions",Players=["p1","p2","p3"],Count=3});Assert.Equal(3,state.DrawOptions.Count);
    }
    [Fact]
    public void RentalSuspensionCountsOnlyNewRegistrationsAndCancellationOrDeletionReturnsTheCount()
    {
        var state=State();
        state.Rentals.Add(new("old","Anterior",DateTimeOffset.UtcNow.AddDays(-1),[],FinishedAt:DateTimeOffset.UtcNow));
        Act(state,new(){Type="suspendPlayer",Id="p1",SuspensionRentals=1});
        Assert.Equal(1,PeladaRules.RemainingSuspensionRentals(state.Players[0],state));
        Act(state,new(){Type="generateDrawOptions",Players=["p2","p3","p4"],Count=3});
        Act(state,new(){Type="selectDrawOption",Id=state.DrawOptions[0].Id});
        Act(state,new(){Type="startRental",Name="Nova",PlayedOn=Today()});var id=state.Rentals[^1].Id;
        Assert.False(PeladaRules.IsSuspended(state.Players[0],state));
        Act(state,new(){Type="cancelRental",RentalId=id});Assert.True(PeladaRules.IsSuspended(state.Players[0],state));
        Act(state,new(){Type="draw",Players=["p2","p3"],Count=2});
        Act(state,new(){Type="startRental",Name="Outra",PlayedOn=Today()});id=state.Rentals[^1].Id;
        Assert.False(PeladaRules.IsSuspended(state.Players[0],state));
        Act(state,new(){Type="deleteRental",RentalId=id});Assert.True(PeladaRules.IsSuspended(state.Players[0],state));
        state.Rentals.Add(new("history","Importada",DateTimeOffset.UtcNow,[],FinishedAt:DateTimeOffset.UtcNow,IsHistorical:true));
        Assert.Equal(1,PeladaRules.RemainingSuspensionRentals(state.Players[0],state));
    }
    [Fact]
    public void RejectsInvalidSuspensionsAndPreservesThemInBackup()
    {
        var state=State();
        foreach(var count in new[]{0,-1,1001})Assert.Throws<ApiError>(()=>Act(state,new(){Type="suspendPlayer",Id="p1",SuspensionRentals=count}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="suspendPlayer",Id="p1",SuspensionUntil=Today().AddDays(-1)}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="suspendPlayer",Id="p1",SuspensionUntil=Today(),SuspensionRentals=1}));
        Act(state,new(){Type="suspendPlayer",Id="p1",SuspensionRentals=2});
        var copy=new PeladaState();Act(copy,new(){Type="importLegacy",Data=state});Assert.Equal(state.Players[0].Suspension,copy.Players[0].Suspension);
    }
}
