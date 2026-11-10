using System.Text.Json;
using System.Text.RegularExpressions;

namespace Pelada.Api;

public sealed class ApiError(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
    public static void Require(bool valid, string message, int status = 400)
    {
        if (!valid) throw new ApiError(status, message);
    }
}

public sealed record PlayerSuspension(DateTimeOffset StartedAt, DateOnly? Until = null, int? RentalCount = null);
public sealed record Player(string Id, string Name, decimal Level, string? Position = null, int InitialRentals = 0, PlayerSuspension? Suspension = null, bool IsInactive = false);
public sealed record Team(string Id, string Name, List<string> Players, decimal Strength);
public sealed record DrawOption(string Id, int Number, List<Team> Teams);
public sealed record MonthlyFeeCharge(string PlayerId, string PlayerName, DateTimeOffset? PaidAt = null,
    string? RecordedBy = null, string? RecordedByName = null, bool ImportedPaid = false,
    string? ImportSourceCell = null, DateTimeOffset? ImportedAt = null);
public sealed record CashIncome(string Id, DateOnly Date, decimal Amount, string Description);
public sealed record CashExpense(string Id, DateOnly Date, decimal Amount, string Description, string? ImportSourceCell = null);
public sealed record MonthlyFeeMonth(string Month, decimal Amount, List<MonthlyFeeCharge> Charges);
public sealed record Match(string Id, DateTimeOffset Date, List<string> A, List<string> B,
    string NameA, string NameB, int ScoreA, int ScoreB, string? CreatedBy, string CreatedByName,
    string? RentalId = null, string? TeamAId = null, string? TeamBId = null);
public sealed record Rental(string Id, string Name, DateTimeOffset CreatedAt, List<Team> Teams,
    DateTimeOffset? FinishedAt = null, string? WinnerTeamId = null, string? PhotoId = null, DateOnly? PlayedOn = null,
    DateTimeOffset? CancelledAt = null, string? Location = null, string? WinningGoalkeeperId = null,
    bool IsHistorical = false, string? ParticipantsText = null, string? ImportSourceId = null, string? SourcePhotoUrl = null, bool IsManual = false);
public sealed class PeladaState
{
    public List<Player> Players { get; set; } = [];
    public List<Team> Teams { get; set; } = [];
    public List<Match> Matches { get; set; } = [];
    public List<Rental> Rentals { get; set; } = [];
    public List<DrawOption> DrawOptions { get; set; } = [];
    public List<CashIncome> Incomes { get; set; } = [];
    public List<CashExpense> Expenses { get; set; } = [];
    public List<MonthlyFeeMonth> MonthlyFees { get; set; } = [];
    public string? SelectedDrawOptionId { get; set; }
}
public sealed class ActionRequest
{
    public string Type { get; set; } = "";
    public long Revision { get; set; } = -1;
    public string? Id { get; set; }
    public string? Name { get; set; }
    public decimal Level { get; set; }
    public string? Position { get; set; }
    public string? RentalId { get; set; }
    public string? WinnerTeamId { get; set; }
    public string? WinningGoalkeeperId { get; set; }
    public bool NoWinner { get; set; }
    public DateOnly? PlayedOn { get; set; }
    public string? Location { get; set; }
    public string? Month { get; set; }
    public bool? Paid { get; set; }
    public DateOnly? SuspensionUntil { get; set; }
    public int? SuspensionRentals { get; set; }
    public DateOnly? IncomeDate { get; set; }
    public DateOnly? ExpenseDate { get; set; }
    public decimal Amount { get; set; }
    public string? Description { get; set; }
    public List<string>? Players { get; set; }
    public int Count { get; set; }
    public string? A { get; set; }
    public string? B { get; set; }
    public int ScoreA { get; set; } = -1;
    public int ScoreB { get; set; } = -1;
    public PeladaState? Data { get; set; }
}

public static partial class PeladaRules
{
    public static bool IsGoalkeeper(Player player) => player.Name.TrimEnd().EndsWith("(GL)", StringComparison.OrdinalIgnoreCase) || player.Position == "Goleiro";
    public static int RemainingSuspensionRentals(Player player, PeladaState state) => player.Suspension?.RentalCount is int count
        ? Math.Max(0,count-state.Rentals.Count(r=>!r.IsHistorical && !r.IsManual && r.CancelledAt is null && r.CreatedAt>=player.Suspension.StartedAt)) : 0;
    public static bool IsSuspended(Player player, PeladaState state, DateOnly? date = null)
    {
        var suspension=player.Suspension;if(suspension is null)return false;
        var today=DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTimeOffset.UtcNow,"America/Sao_Paulo").DateTime);
        return suspension.Until is DateOnly until ? (date??today)<=until : RemainingSuspensionRentals(player,state)>0;
    }
    private static bool ValidSuspension(PlayerSuspension? suspension) => suspension is null ||
        (suspension.StartedAt!=default && ((suspension.Until is not null && suspension.Until!=DateOnly.MinValue && suspension.RentalCount is null) ||
        (suspension.Until is null && suspension.RentalCount is >=1 and <=1000)));
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static string Id() => Guid.NewGuid().ToString();
    private static bool ValidName(string? name) => !string.IsNullOrWhiteSpace(name) && name.Trim().Length <= 50;
    public static readonly string[] Positions = ["Goleiro", "Zagueiro", "Lateral", "Volante", "Meia", "Ponta", "Atacante", "Fixo", "Ala", "Pivô"];
    private static bool ValidLevel(decimal level) => level is >= 0.5m and <= 5m && level % 0.5m == 0;
    private static bool ValidPosition(string? position) => position is not null && Positions.Contains(position);
    [GeneratedRegex("^[a-zA-Z0-9_-]{1,100}$")]
    private static partial Regex IdPattern();
    private static bool ValidId(string? id) => id is not null && IdPattern().IsMatch(id);
    private static bool ValidMonth(string? month) => month is {Length:7} && DateOnly.TryParseExact(month+"-01", "yyyy-MM-dd",
        System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out _);
    private static string CurrentMonth() => TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTimeOffset.UtcNow,"America/Sao_Paulo")
        .ToString("yyyy-MM",System.Globalization.CultureInfo.InvariantCulture);

    public static List<Team> Draw(IReadOnlyList<Player> players, int count, Random? random = null, bool vary = false)
    {
        ApiError.Require(count is >= 2 and <= 6 && players.Count >= count,
            "Selecione pelo menos um jogador por time (2 a 6 times).");
        random ??= Random.Shared;
        var teams = Enumerable.Range(1, count).Select(i => new Team(Id(), $"Time {i}", [], 0)).ToList();
        foreach (var player in players.Select(p => (Player: p, Tie: random.NextDouble()))
                     .OrderByDescending(p => (double)p.Player.Level + (vary ? p.Tie * 2 : 0)).ThenBy(p => p.Tie).Select(p => p.Player))
        {
            var index = Enumerable.Range(0, count).OrderBy(i => teams[i].Players.Count)
                .ThenBy(i => teams[i].Strength).First();
            var team = teams[index];
            team.Players.Add(player.Id);
            teams[index] = team with { Strength = team.Strength + player.Level };
        }
        return teams;
    }

    public static string Apply(PeladaState state, ActionRequest input, string actorId, string actorName, bool owner)
    {
        switch (input.Type)
        {
            case "addPlayer":
                ApiError.Require(state.Players.Count < 500, "Limite de 500 jogadores atingido.");
                ApiError.Require(ValidName(input.Name), "Informe um nome com até 50 caracteres.");
                ApiError.Require(ValidLevel(input.Level), "Escolha de 0,5 a 5 estrelas, em passos de 0,5.");
                ApiError.Require(ValidPosition(input.Position), "Escolha a posição do jogador.");
                var addedPlayer = new Player(Id(), input.Name!.Trim(), input.Level, input.Position);
                state.Players.Add(addedPlayer);
                var currentMonth=CurrentMonth();
                foreach(var fees in state.MonthlyFees.Where(f=>string.CompareOrdinal(f.Month,currentMonth)>=0))
                    fees.Charges.Add(new MonthlyFeeCharge(addedPlayer.Id,addedPlayer.Name));
                return $"Cadastrou {input.Name.Trim()}";
            case "suspendPlayer":
            {
                var index=state.Players.FindIndex(p=>p.Id==input.Id);
                ApiError.Require(index>=0,"Jogador não encontrado.",404);
                var suspension=new PlayerSuspension(DateTimeOffset.UtcNow,input.SuspensionUntil,input.SuspensionRentals);
                ApiError.Require(ValidSuspension(suspension),"Escolha uma data final ou uma quantidade de 1 a 1000 peladas.");
                var today=DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTimeOffset.UtcNow,"America/Sao_Paulo").DateTime);
                ApiError.Require(suspension.Until is null || suspension.Until>=today,"A data final não pode estar no passado.");
                state.Players[index]=state.Players[index] with{Suspension=suspension};
                state.Teams=[];state.DrawOptions=[];state.SelectedDrawOptionId=null;
                return $"Suspendeu {state.Players[index].Name}";
            }
            case "clearPlayerSuspension":
            {
                var index=state.Players.FindIndex(p=>p.Id==input.Id);
                ApiError.Require(index>=0,"Jogador não encontrado.",404);
                state.Players[index]=state.Players[index] with{Suspension=null};
                return $"Retirou a suspensão de {state.Players[index].Name}";
            }
            case "addIncome":
            {
                ApiError.Require(input.IncomeDate is not null && input.IncomeDate != DateOnly.MinValue,"Informe a data da entrada.");
                ApiError.Require(input.Amount > 0 && input.Amount <= 1000000 && decimal.Round(input.Amount,2)==input.Amount,"Informe um valor positivo com até duas casas decimais, de até R$ 1.000.000,00.");
                ApiError.Require(!string.IsNullOrWhiteSpace(input.Description) && input.Description.Trim().Length<=500,"Informe a descrição da entrada com até 500 caracteres.");
                ApiError.Require(state.Incomes.Count<10000,"Limite de entradas atingido.");
                state.Incomes.Add(new CashIncome(Id(),input.IncomeDate!.Value,input.Amount,input.Description!.Trim()));
                return $"Registrou entrada: {input.Description.Trim()}";
            }
            case "addExpense":
            {
                ApiError.Require(input.ExpenseDate is not null && input.ExpenseDate != DateOnly.MinValue,"Informe a data do gasto.");
                ApiError.Require(input.Amount > 0 && input.Amount <= 1000000 && decimal.Round(input.Amount,2)==input.Amount,"Informe um valor positivo com até duas casas decimais, de até R$ 1.000.000,00.");
                ApiError.Require(!string.IsNullOrWhiteSpace(input.Description) && input.Description.Trim().Length<=500,"Informe a descrição do gasto com até 500 caracteres.");
                ApiError.Require(state.Expenses.Count<10000,"Limite de gastos atingido.");
                state.Expenses.Add(new CashExpense(Id(),input.ExpenseDate!.Value,input.Amount,input.Description!.Trim()));
                return $"Registrou gasto: {input.Description.Trim()}";
            }
            case "openMonthlyFees":
            {
                ApiError.Require(ValidMonth(input.Month),"Escolha o mês da mensalidade.");
                ApiError.Require(!state.MonthlyFees.Any(f=>f.Month==input.Month),"As mensalidades deste mês já foram abertas.",409);
                ApiError.Require(state.Players.Any(p => !p.IsInactive),"Cadastre os jogadores antes de abrir as mensalidades.");
                ApiError.Require(state.MonthlyFees.Count<240,"Limite de 240 meses atingido.");
                state.MonthlyFees.Add(new MonthlyFeeMonth(input.Month!,10m,
                    state.Players.Where(p => !p.IsInactive).Select(p=>new MonthlyFeeCharge(p.Id,p.Name)).ToList()));
                return $"Abriu mensalidades de {input.Month}: R$ 10,00 por jogador";
            }
            case "setMonthlyFeePayment":
            {
                ApiError.Require(ValidMonth(input.Month) && input.Paid.HasValue,"Informe o mês e se o pagamento foi recebido.");
                var fees=state.MonthlyFees.Find(f=>f.Month==input.Month);
                ApiError.Require(fees is not null,"As mensalidades deste mês ainda não foram abertas.",404);
                var index=fees!.Charges.FindIndex(c=>c.PlayerId==input.Id);
                ApiError.Require(index>=0,"Cobrança do jogador não encontrada neste mês.",404);
                var charge=fees.Charges[index];
                ApiError.Require((charge.PaidAt is not null || charge.ImportedPaid)!=input.Paid!.Value,"O pagamento já está com esse status. Atualize a tela.",409);
                fees.Charges[index]=input.Paid.Value ? charge with {PaidAt=DateTimeOffset.UtcNow,RecordedBy=actorId,RecordedByName=actorName,ImportedPaid=false}
                    : charge with {PaidAt=null,RecordedBy=null,RecordedByName=null,ImportedPaid=false};
                return input.Paid.Value ? $"Registrou R$ 10,00 de {charge.PlayerName} em {fees.Month}" :
                    $"Desfez o registro de pagamento de {charge.PlayerName} em {fees.Month}";
            }
            case "updateLevel":
            {
                var index = state.Players.FindIndex(p => p.Id == input.Id);
                ApiError.Require(index >= 0, "Jogador não encontrado.", 404);
                ApiError.Require(ValidLevel(input.Level), "Escolha de 0,5 a 5 estrelas, em passos de 0,5.");
                state.Players[index] = state.Players[index] with { Level = input.Level };
                return $"Alterou o nível de {state.Players[index].Name}";
            }
            case "updatePosition":
            {
                var index = state.Players.FindIndex(p => p.Id == input.Id);
                ApiError.Require(index >= 0, "Jogador não encontrado.", 404);
                ApiError.Require(ValidPosition(input.Position), "Escolha a posição do jogador.");
                state.Players[index] = state.Players[index] with { Position = input.Position };
                return $"Alterou a posição de {state.Players[index].Name}";
            }
            case "removePlayer": // Older app versions use this action.
            case "deactivatePlayer":
            case "reactivatePlayer":
            {
                var index = state.Players.FindIndex(player => player.Id == input.Id);
                ApiError.Require(index >= 0, "Jogador não encontrado.", 404);
                var inactive = input.Type != "reactivatePlayer";
                var player = state.Players[index];
                state.Players[index] = player with { IsInactive = inactive };

                if (inactive && (state.Teams.Any(team => team.Players.Contains(player.Id)) ||
                    state.DrawOptions.Any(option => option.Teams.Any(team => team.Players.Contains(player.Id)))))
                {
                    state.Teams.Clear();
                    state.DrawOptions.Clear();
                    state.SelectedDrawOptionId = null;
                }
                if (!inactive)
                {
                    var month = CurrentMonth();
                    foreach (var fees in state.MonthlyFees.Where(fees => string.CompareOrdinal(fees.Month, month) >= 0))
                        if (!fees.Charges.Any(charge => charge.PlayerId == player.Id))
                            fees.Charges.Add(new MonthlyFeeCharge(player.Id, player.Name));
                }
                return inactive ? $"Desativou {player.Name}" : $"Reativou {player.Name}";
            }
            case "generateDrawOptions":
            {
                ApiError.Require(input.Count is 3 or 4, "Escolha 3 ou 4 times.");
                ApiError.Require(input.Players is { Count: <= 500 } && input.Players.Distinct().Count() == input.Players.Count,
                    "Seleção de jogadores inválida.");
                ApiError.Require(input.Players!.All(id => state.Players.Any(p => p.Id == id && !p.IsInactive)), "A seleção contém um jogador inativo ou removido.");
                var players = state.Players.Where(p => input.Players!.Contains(p.Id)).ToList();
                ApiError.Require(players.All(p=>!IsSuspended(p,state)),"A seleção contém jogador suspenso. Atualize os presentes.");
                var options = new List<DrawOption>();
                var signatures = new HashSet<string>();
                static string Signature(List<Team> teams) => string.Join("|", teams.Select(t => string.Join(",", t.Players.Order())).Order());
                for (var number = 1; number <= 3; number++)
                {
                    List<Team> teams = [];
                    for (var attempt = 0; attempt < 40; attempt++)
                    {
                        teams = Draw(players, input.Count, vary: true);
                        if (signatures.Add(Signature(teams))) break;
                    }
                    options.Add(new DrawOption(Id(), number, teams));
                }
                state.DrawOptions = options; state.SelectedDrawOptionId = null; state.Teams = [];
                return "Gerou 3 opções de sorteio para votação no WhatsApp";
            }
            case "cancelDrawOptions":
            {
                ApiError.Require(state.DrawOptions.Count > 0, "Não há sorteios para cancelar.");
                state.DrawOptions = [];
                state.SelectedDrawOptionId = null;
                state.Teams = [];
                return "Cancelou as opções de sorteio";
            }
            case "selectDrawOption":
            {
                var option = state.DrawOptions.Find(o => o.Id == input.Id);
                ApiError.Require(option is not null, "Esta opção de sorteio não está mais disponível.", 409);
                ApiError.Require(state.Players.Where(p=>option!.Teams.SelectMany(t=>t.Players).Contains(p.Id)).All(p=>!IsSuspended(p,state)),"Esta opção contém jogador suspenso. Gere um novo sorteio.");
                state.SelectedDrawOptionId = option!.Id;
                state.Teams = option.Teams.Select(t => t with { Players = [..t.Players] }).ToList();
                return $"Escolheu o sorteio {option.Number} como vencedor da enquete";
            }
            case "draw":
            {
                ApiError.Require(input.Players is { Count: <= 500 } && input.Players.Distinct().Count() == input.Players.Count,
                    "Seleção de jogadores inválida.");
                ApiError.Require(input.Players!.All(id => state.Players.Any(p => p.Id == id && !p.IsInactive)), "A seleção contém um jogador inativo ou removido.");
                ApiError.Require(state.Players.Where(p=>input.Players!.Contains(p.Id)).All(p=>!IsSuspended(p,state)),"A seleção contém jogador suspenso.");
                state.Teams = Draw(state.Players.Where(p => input.Players!.Contains(p.Id)).ToList(), input.Count);
                state.DrawOptions = [];state.SelectedDrawOptionId = null;
                return $"Sorteou {input.Count} times";
            }
            case "startRental":
            {
                ApiError.Require(!state.Rentals.Any(r => r.FinishedAt is null), "Já existe um aluguel em andamento.");
                ApiError.Require(state.Rentals.Count < 1000, "Limite de mil aluguéis atingido.");
                ApiError.Require(ValidName(input.Name), "Informe um nome para o aluguel com até 50 caracteres.");
                ApiError.Require(input.PlayedOn is not null && input.PlayedOn != DateOnly.MinValue, "Informe o dia da pelada.");
                ApiError.Require(input.Location is null || input.Location.Trim().Length <= 120, "Informe um local com até 120 caracteres.");
                ApiError.Require(state.Teams.Count >= 2, "Sorteie os times antes de iniciar o aluguel.");
                ApiError.Require(state.DrawOptions.Count == 0 || state.DrawOptions.Any(o => o.Id == state.SelectedDrawOptionId),
                    "Escolha o sorteio vencedor da enquete antes de cadastrar a pelada.");
                ApiError.Require(state.Players.Where(p=>state.Teams.SelectMany(t=>t.Players).Contains(p.Id)).All(p=>!IsSuspended(p,state,input.PlayedOn)),"Os times contêm jogador suspenso para a data da pelada. Faça outro sorteio.");
                var teams = state.Teams.Select(t => t with { Players = [..t.Players] }).ToList();
                state.Rentals.Add(new Rental(Id(), input.Name!.Trim(), DateTimeOffset.UtcNow, teams, PlayedOn: input.PlayedOn,
                    Location: string.IsNullOrWhiteSpace(input.Location) ? null : input.Location.Trim()));
                state.Teams = [];
                state.DrawOptions = [];state.SelectedDrawOptionId = null;
                return $"Cadastrou a pelada {input.Name.Trim()} para {input.PlayedOn:dd/MM/yyyy}";
            }
            case "addManualRental":
            {
                ApiError.Require(state.Rentals.Count < 1000, "Limite de mil aluguéis atingido.");
                ApiError.Require(ValidName(input.Name), "Informe um nome para o aluguel com até 50 caracteres.");
                ApiError.Require(input.PlayedOn is not null && input.PlayedOn != DateOnly.MinValue, "Informe o dia da pelada.");
                ApiError.Require(input.Location is null || input.Location.Trim().Length <= 120, "Informe um local com até 120 caracteres.");
                ApiError.Require(input.Players is { Count: > 0 and <= 500 }, "Selecione os jogadores vencedores.");
                var playerIds = input.Players!.ToHashSet();
                var winners = state.Players.Where(player => playerIds.Contains(player.Id)).ToList();
                ApiError.Require(winners.Count == input.Players!.Count, "Seleção de jogadores inválida.");
                ApiError.Require(input.WinningGoalkeeperId is null || state.Players.Any(p => p.Id == input.WinningGoalkeeperId),
                    "Selecione um goleiro cadastrado.");
                var team = new Team(Id(), "Time vencedor", winners.Select(p => p.Id).ToList(), winners.Sum(p => p.Level));
                var now = DateTimeOffset.UtcNow;
                state.Rentals.Add(new Rental(Id(), input.Name!.Trim(), now, [team], FinishedAt: now, WinnerTeamId: team.Id,
                    PlayedOn: input.PlayedOn, Location: input.Location?.Trim(), WinningGoalkeeperId: input.WinningGoalkeeperId,
                    IsManual: true));
                return $"Cadastrou manualmente o aluguel {input.Name.Trim()}";
            }
            case "finishRental":
            {
                var index = state.Rentals.FindIndex(r => r.Id == input.RentalId);
                ApiError.Require(index >= 0, "Aluguel não encontrado.", 404);
                var rental = state.Rentals[index];
                ApiError.Require(rental.FinishedAt is null, "Este aluguel já foi encerrado.");
                ApiError.Require(rental.PhotoId is not null, "Adicione a foto do aluguel antes de salvar o resultado.");
                ApiError.Require(input.NoWinner ? input.WinnerTeamId is null : rental.Teams.Any(t => t.Id == input.WinnerTeamId),
                    "Escolha um time deste aluguel ou a opção sem vencedor.");
                var winner = input.NoWinner ? null : rental.Teams.Single(t => t.Id == input.WinnerTeamId);
                ApiError.Require(input.NoWinner ? input.WinningGoalkeeperId is null :
                    input.WinningGoalkeeperId is null ? !state.Players.Any(IsGoalkeeper) :
                    state.Players.Any(p => p.Id == input.WinningGoalkeeperId),
                    "Selecione o goleiro que conquistou o aluguel. Sem vencedor, não informe goleiro vencedor.");
                state.Rentals[index] = rental with { FinishedAt = DateTimeOffset.UtcNow, WinnerTeamId = winner?.Id,
                    WinningGoalkeeperId = input.NoWinner ? null : input.WinningGoalkeeperId };
                return winner is null ? $"Encerrou {rental.Name} sem vencedor e sem conquistas individuais" :
                    $"Encerrou {rental.Name}: {winner.Name} vencedor, 1 aluguel por jogador";
            }
            case "deleteRental":
            {
                var rental = state.Rentals.Find(r => r.Id == input.RentalId);
                ApiError.Require(rental is not null, "Aluguel não encontrado.", 404);
                state.Rentals.Remove(rental!);
                state.Matches.RemoveAll(m => m.RentalId == rental!.Id);
                return $"Apagou o aluguel {rental!.Name}";
            }
            case "cancelRental":
            {
                var index = state.Rentals.FindIndex(r => r.Id == input.RentalId);
                ApiError.Require(index >= 0, "Pelada não encontrada.", 404);
                var rental = state.Rentals[index];
                ApiError.Require(rental.FinishedAt is null, "Só é possível cancelar uma pelada em andamento.");
                var now = DateTimeOffset.UtcNow;
                state.Rentals[index] = rental with { FinishedAt = now, CancelledAt = now, WinnerTeamId = null, WinningGoalkeeperId = null };
                return $"Cancelou a pelada {rental.Name}, sem conquistas individuais";
            }
            case "reopenRental":
            {
                ApiError.Require(!state.Rentals.Any(r => r.FinishedAt is null), "Encerre o aluguel em andamento antes de reabrir outro.");
                var index = state.Rentals.FindIndex(r => r.Id == input.RentalId);
                ApiError.Require(index >= 0, "Aluguel não encontrado.", 404);
                var rental = state.Rentals[index];
                ApiError.Require(rental.CancelledAt is null, "Uma pelada cancelada não pode ter o vencedor corrigido.");
                ApiError.Require(!rental.IsHistorical, "Este registro histórico não possui times ou vencedor identificado.");
                ApiError.Require(!rental.IsManual, "Este aluguel manual não possui outros times para escolher.");
                state.Rentals[index] = rental with { FinishedAt = null, WinnerTeamId = null, WinningGoalkeeperId = null };
                state.Teams = rental.Teams.Select(t => t with { Players = [..t.Players] }).ToList();
                return $"Reabriu {rental.Name} e retirou as conquistas individuais até a correção do vencedor";
            }
            case "importLegacy":
            {
                ApiError.Require(owner, "Apenas o responsável pode importar os dados iniciais.", 403);
                ApiError.Require(state.Players.Count == 0 && state.Teams.Count == 0 && state.Matches.Count == 0 && state.Rentals.Count == 0 && state.MonthlyFees.Count == 0 && state.Expenses.Count == 0 && state.Incomes.Count == 0,
                    "A importação inicial exige uma pelada vazia.", 409);
                var data = input.Data;
                ApiError.Require(data?.Players is { Count: <= 500 } && data.Matches is { Count: <= 10000 }, "Arquivo inválido.");
                ApiError.Require(data!.Players.All(p => p is not null && ValidId(p.Id) && ValidName(p.Name) && ValidLevel(p.Level) && p.InitialRentals is >= 0 and <= 100000 && ValidSuspension(p.Suspension) && (p.Position is null || ValidPosition(p.Position))) &&
                    data.Players.Select(p => p.Id).Distinct().Count() == data.Players.Count, "Jogadores inválidos ou duplicados.");
                static bool Side(List<string>? ids) => ids is { Count: > 0 and <= 500 } && ids.All(ValidId) && ids.Distinct().Count() == ids.Count;
                ApiError.Require(data.Matches.All(m => m is not null && ValidId(m.Id) && Side(m.A) && Side(m.B) &&
                    !m.A.Intersect(m.B).Any() && ValidName(m.NameA) && ValidName(m.NameB) && m.Date != default &&
                    m.ScoreA is >= 0 and <= 999 && m.ScoreB is >= 0 and <= 999) &&
                    data.Matches.Select(m => m.Id).Distinct().Count() == data.Matches.Count, "Partidas inválidas ou duplicadas.");
                ValidateRentals(data);
                ApiError.Require(data.MonthlyFees is {Count:<=240} && data.MonthlyFees.All(f=>f is not null && ValidMonth(f.Month) && f.Amount==10m &&
                    f.Charges is {Count:<=5000} && f.Charges.All(c=>c is not null && ValidId(c.PlayerId) && ValidName(c.PlayerName) &&
                        (c.ImportedPaid ? c.PaidAt is null && c.ImportSourceCell is {Length:>0 and <=100} && c.ImportedAt is not null :
                            c.PaidAt is null ? c.RecordedBy is null && c.RecordedByName is null : c.RecordedBy is not null && ValidName(c.RecordedByName))) &&
                    f.Charges.Select(c=>c.PlayerId).Distinct().Count()==f.Charges.Count) &&
                    data.MonthlyFees.Select(f=>f.Month).Distinct().Count()==data.MonthlyFees.Count,"Mensalidades inválidas no backup.");
                state.Players = data.Players.Select(p => p with { Name = p.Name.Trim() }).ToList();
                state.Matches = data.Matches.Select(m => m with { CreatedBy = actorId, CreatedByName = "Importação de backup" }).ToList();
                state.Rentals = data.Rentals.Select(r => r with { PhotoId = null }).ToList();
                ApiError.Require(data.Expenses is {Count:<=10000} && data.Expenses.All(e=>e is not null && ValidId(e.Id) &&
                    e.Date != default && e.Amount > 0 && e.Amount <= 1000000 && decimal.Round(e.Amount,2)==e.Amount &&
                    !string.IsNullOrWhiteSpace(e.Description) && e.Description.Length<=500 &&
                    (e.ImportSourceCell is null || e.ImportSourceCell.Length<=100)) &&
                    data.Expenses.Select(e=>e.Id).Distinct().Count()==data.Expenses.Count,"Gastos inválidos no backup.");
                ApiError.Require(data.Incomes is {Count:<=10000} && data.Incomes.All(e=>e is not null && ValidId(e.Id) &&
                    e.Date != default && e.Amount > 0 && e.Amount <= 1000000 && decimal.Round(e.Amount,2)==e.Amount &&
                    !string.IsNullOrWhiteSpace(e.Description) && e.Description.Length<=500) &&
                    data.Incomes.Select(e=>e.Id).Distinct().Count()==data.Incomes.Count,"Entradas inválidas no backup.");
                state.MonthlyFees = data.MonthlyFees!;
                state.Expenses = data.Expenses!;
                state.Incomes = data.Incomes!;
                return "Importou jogadores e resultados de um backup";
            }
            default: throw new ApiError(400, "Operação desconhecida.");
        }
    }

    private static void ValidateRentals(PeladaState data)
    {
        ApiError.Require(data.Rentals is { Count: <= 1000 }, "Aluguéis inválidos.");
        ApiError.Require(data.Rentals!.All(r => r is not null && ValidId(r.Id) && ValidName(r.Name) && r.CreatedAt != default &&
            (r.Location is null || r.Location.Length <= 120) &&
            (r.IsManual ? !r.IsHistorical && r.Teams is { Count: 1 } && r.FinishedAt is not null &&
                r.CancelledAt is null && r.WinnerTeamId is not null && r.WinnerTeamId == r.Teams[0]?.Id :
                r.IsHistorical ? r.Teams is {Count: 0} && r.FinishedAt is not null && r.WinnerTeamId is null && r.WinningGoalkeeperId is null : r.Teams is { Count: >= 2 and <= 6 }) &&
            (r.ParticipantsText is null || r.ParticipantsText.Length <= 20000) &&
            (r.SourcePhotoUrl is null || (Uri.TryCreate(r.SourcePhotoUrl, UriKind.Absolute, out var photoUri) && photoUri.Scheme == "https")) &&
            r.Teams.All(t => t is not null && ValidId(t.Id) && ValidName(t.Name) &&
                t.Players is { Count: > 0 and <= 500 } && t.Players.All(ValidId) && t.Strength >= 0) &&
            r.Teams.Select(t => t.Id).Distinct().Count() == r.Teams.Count &&
            r.Teams.SelectMany(t => t.Players).Distinct().Count() == r.Teams.Sum(t => t.Players.Count) &&
            (r.FinishedAt is null ? r.WinnerTeamId is null : r.FinishedAt >= r.CreatedAt) &&
            (r.CancelledAt is null || (r.FinishedAt == r.CancelledAt && r.WinnerTeamId is null)) &&
            (r.WinningGoalkeeperId is null || (r.FinishedAt is not null && r.WinnerTeamId is not null &&
                data.Players.Any(p => p.Id == r.WinningGoalkeeperId)))) &&
            data.Rentals.Select(r => r.Id).Distinct().Count() == data.Rentals.Count &&
            data.Rentals.Count(r => r.FinishedAt is null) <= 1, "Aluguéis ou times inválidos.");
        foreach (var match in data.Matches)
        {
            if (match.RentalId is null)
            {
                ApiError.Require(match.TeamAId is null && match.TeamBId is null, "Partida sem aluguel contém times vinculados.");
                continue;
            }
            var rental = data.Rentals.Find(r => r.Id == match.RentalId);
            var a = rental?.Teams.Find(t => t.Id == match.TeamAId);
            var b = rental?.Teams.Find(t => t.Id == match.TeamBId);
            ApiError.Require(a is not null && b is not null && a.Id != b.Id && a.Players.ToHashSet().SetEquals(match.A) &&
                b.Players.ToHashSet().SetEquals(match.B), "Uma partida não corresponde aos times do aluguel.");
        }
        ApiError.Require(data.Rentals.All(r => r.WinnerTeamId is null || r.Teams.Any(t => t.Id == r.WinnerTeamId)),
            "O vencedor informado não faz parte do aluguel.");
    }
}
