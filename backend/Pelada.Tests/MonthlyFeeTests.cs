using System.Globalization;
using System.Text.Json;
using Pelada.Api;
using Xunit;

namespace Pelada.Tests;
public sealed class MonthlyFeeTests
{
    private static PeladaState State()=>new(){Players=[new("a","Ana",3),new("b","Beto (GL)",5)]};
    private static void Act(PeladaState state,ActionRequest input)=>PeladaRules.Apply(state,input,"owner","Organizador",true);
    [Fact]
    public void ExemptionIsLimitedToOneMonthAndCannotReplacePayment()
    {
        var state = State();
        Act(state, new() { Type = "openMonthlyFees", Month = "2026-11" });
        Act(state, new() { Type = "openMonthlyFees", Month = "2026-12" });
        var exemption = new ActionRequest { Type = "setMonthlyFeeExemption", Id = "a", Month = "2026-11", Exempt = true };
        var payment = new ActionRequest { Type = "setMonthlyFeePayment", Id = "a", Month = "2026-11", Paid = true };
        Act(state, exemption);
        Assert.True(state.MonthlyFees[0].Charges[0].IsExempt);
        Assert.False(state.MonthlyFees[1].Charges[0].IsExempt);
        Assert.Throws<ApiError>(() => Act(state, payment));
        exemption.Exempt = false;
        Act(state, exemption);
        Act(state, payment);
        exemption.Exempt = true;
        Assert.Throws<ApiError>(() => Act(state, exemption));
        Assert.NotNull(state.MonthlyFees[0].Charges[0].PaidAt);
    }

    [Fact]
    public void ExpenseBackupPreservesDatesAndRejectsInvalidOrDuplicateEntries()
    {
        var source=State();source.Expenses.Add(new("expense-a",new DateOnly(2026,2,10),12.5m,"Material","MENSALIDADES!T14:V14"));
        var target=new PeladaState();Act(target,new(){Type="importLegacy",Data=source});
        Assert.Equal(source.Expenses,target.Expenses);
        Assert.Throws<ApiError>(()=>Act(target,new(){Type="importLegacy",Data=source}));
        source.Expenses.Add(source.Expenses[0]);Assert.Throws<ApiError>(()=>Act(new(),new(){Type="importLegacy",Data=source}));
        source.Expenses.RemoveAt(1);source.Expenses[0]=source.Expenses[0] with{Amount=-1};
        Assert.Throws<ApiError>(()=>Act(new(),new(){Type="importLegacy",Data=source}));
    }
    [Fact]
    public void AddsIncomesWithMoneyAndDateValidation()
    {
        var state=State();Act(state,new(){Type="addIncome",IncomeDate=new DateOnly(2026,10,31),Amount=15.50m,Description="  Bola  "});
        var expense=Assert.Single(state.Incomes);Assert.Equal("Bola",expense.Description);Assert.Equal(15.50m,expense.Amount);
        foreach(var amount in new[]{0m,-1m,1.001m,1000001m}) Assert.Throws<ApiError>(()=>Act(state,new(){Type="addIncome",IncomeDate=expense.Date,Amount=amount,Description="Bola"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="addIncome",Amount=10,Description="Bola"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="addIncome",IncomeDate=expense.Date,Amount=10,Description=" "}));
        Assert.Single(state.Incomes);
        var copy=new PeladaState();Act(copy,new(){Type="importLegacy",Data=state});Assert.Equal(state.Incomes,copy.Incomes);
        state.Incomes.Add(state.Incomes[0]);Assert.Throws<ApiError>(()=>Act(new(),new(){Type="importLegacy",Data=state}));
    }
    [Fact]
    public void AddsExpensesWithMoneyAndDateValidation()
    {
        var state=State();Act(state,new(){Type="addExpense",ExpenseDate=new DateOnly(2026,10,31),Amount=15.50m,Description="  Bola  "});
        var expense=Assert.Single(state.Expenses);Assert.Equal("Bola",expense.Description);Assert.Equal(15.50m,expense.Amount);Assert.Null(expense.ImportSourceCell);
        foreach(var amount in new[]{0m,-1m,1.001m,1000001m}) Assert.Throws<ApiError>(()=>Act(state,new(){Type="addExpense",ExpenseDate=expense.Date,Amount=amount,Description="Bola"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="addExpense",Amount=10,Description="Bola"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="addExpense",ExpenseDate=expense.Date,Amount=10,Description=" "}));
        Assert.Single(state.Expenses);
    }
    [Fact]
    public void OpensTenReaisForEveryPlayerOnceAndKeepsMonthsIndependent()
    {
        var state=State();Act(state,new(){Type="openMonthlyFees",Month="2026-10"});
        var month=state.MonthlyFees.Single();Assert.Equal(10m,month.Amount);Assert.Equal(2,month.Charges.Count);
        Assert.All(month.Charges,c=>Assert.Null(c.PaidAt));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="openMonthlyFees",Month="2026-10"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="openMonthlyFees",Month="2026-13"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="openMonthlyFees",Month="2026-1"}));
        Assert.Throws<ApiError>(()=>Act(new(),new(){Type="openMonthlyFees",Month="2026-10"}));
        Act(state,new(){Type="openMonthlyFees",Month="2026-11"});
        Act(state,new(){Type="setMonthlyFeePayment",Month="2026-10",Id="a",Paid=true});
        Assert.NotNull(month.Charges[0].PaidAt);Assert.Equal("owner",month.Charges[0].RecordedBy);
        Assert.Equal("Organizador",month.Charges[0].RecordedByName);
        Assert.Null(state.MonthlyFees[1].Charges[0].PaidAt);
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="setMonthlyFeePayment",Month="2026-10",Id="a",Paid=true}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="setMonthlyFeePayment",Month="2026-10",Id="a"}));
        Assert.Throws<ApiError>(()=>Act(state,new(){Type="setMonthlyFeePayment",Month="2026-10",Id="missing",Paid=true}));
        Act(state,new(){Type="setMonthlyFeePayment",Month="2026-10",Id="a",Paid=false});
        Assert.Null(month.Charges[0].PaidAt);Assert.Null(month.Charges[0].RecordedBy);Assert.Null(month.Charges[0].RecordedByName);
    }
    [Fact]
    public void NewPlayersJoinCurrentAndFutureOpenedMonthsButNotPastMonthsAndDeletionKeepsHistory()
    {
        var state=State();var current=TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTimeOffset.UtcNow,"America/Sao_Paulo");
        var months=new[]{current.AddMonths(-1),current,current.AddMonths(1)}.Select(d=>d.ToString("yyyy-MM",CultureInfo.InvariantCulture)).ToArray();
        foreach(var month in months)Act(state,new(){Type="openMonthlyFees",Month=month});
        Act(state,new(){Type="addPlayer",Name="Caio",Level=3,Position="Meia"});
        Assert.Equal(2,state.MonthlyFees[0].Charges.Count);Assert.Equal(3,state.MonthlyFees[1].Charges.Count);Assert.Equal(3,state.MonthlyFees[2].Charges.Count);
        Act(state,new(){Type="setMonthlyFeePayment",Month=months[1],Id="a",Paid=true});
        Act(state,new(){Type="removePlayer",Id="a"});
        Assert.Equal("Ana",state.MonthlyFees[1].Charges.Single(c=>c.PlayerId=="a").PlayerName);
        Assert.NotNull(state.MonthlyFees[1].Charges.Single(c=>c.PlayerId=="a").PaidAt);
    }
    [Fact]
    public void ImportedPaymentDoesNotInventAReceiptDateAndCanBeCorrected()
    {
        var source=State();Act(source,new(){Type="openMonthlyFees",Month="2026-10"});
        source.MonthlyFees[0].Charges[0]=source.MonthlyFees[0].Charges[0] with
            {ImportedPaid=true,ImportSourceCell="MENSALIDADES!K5",ImportedAt=DateTimeOffset.UtcNow};
        var target=new PeladaState();Act(target,new(){Type="importLegacy",Data=source});
        Assert.True(target.MonthlyFees[0].Charges[0].ImportedPaid);Assert.Null(target.MonthlyFees[0].Charges[0].PaidAt);
        Assert.Throws<ApiError>(()=>Act(target,new(){Type="setMonthlyFeePayment",Month="2026-10",Id="a",Paid=true}));
        Act(target,new(){Type="setMonthlyFeePayment",Month="2026-10",Id="a",Paid=false});
        Assert.False(target.MonthlyFees[0].Charges[0].ImportedPaid);Assert.Null(target.MonthlyFees[0].Charges[0].PaidAt);
        Act(target,new(){Type="setMonthlyFeePayment",Month="2026-10",Id="a",Paid=true});
        Assert.NotNull(target.MonthlyFees[0].Charges[0].PaidAt);
    }
    [Fact]
    public void BackupPreservesTheLedgerAndRejectsChangedAmountsOrDuplicateCharges()
    {
        var source=State();Act(source,new(){Type="openMonthlyFees",Month="2026-10"});
        Act(source,new(){Type="setMonthlyFeePayment",Month="2026-10",Id="b",Paid=true});
        var copy=JsonSerializer.Deserialize<PeladaState>(JsonSerializer.Serialize(source,PeladaRules.Json),PeladaRules.Json)!;
        var target=new PeladaState();Act(target,new(){Type="importLegacy",Data=copy});
        Assert.Equal(10m,target.MonthlyFees[0].Amount);Assert.NotNull(target.MonthlyFees[0].Charges[1].PaidAt);
        copy.MonthlyFees[0]=copy.MonthlyFees[0] with{Amount=11m};
        Assert.Throws<ApiError>(()=>Act(new(),new(){Type="importLegacy",Data=copy}));
        copy.MonthlyFees[0]=copy.MonthlyFees[0] with{Amount=10m};copy.MonthlyFees[0].Charges.Add(copy.MonthlyFees[0].Charges[0]);
        Assert.Throws<ApiError>(()=>Act(new(),new(){Type="importLegacy",Data=copy}));
    }
}
