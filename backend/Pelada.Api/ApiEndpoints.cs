using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Pelada.Api;

public sealed record Registration(string? Name, string? Nick, string? Password, string? SetupToken, string? Invite);
public sealed record Login(string? Nick, string? Password);
public sealed record Revoke(string? Id);
public sealed record ResetOrganizerPassword(string? Id, string? Password);

public static class ApiEndpoints
{
    private static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private static object UserDto(Organizer u) => new { u.Id, u.Name, Nick = u.UserName, Role = u.IsOwner ? "owner" : "organizer" };
    private static async Task<Organizer> Current(ClaimsPrincipal principal, UserManager<Organizer> users)
    {
        var user = await users.GetUserAsync(principal);
        ApiError.Require(user is { IsActive: true }, "Entre na sua conta para continuar.", 401);
        return user!;
    }
    private static void AddActivity(PeladaDb db, Organizer user, string action) =>
        db.Activities.Add(new Activity { ActorId = user.Id, Action = action });

    public static void MapPelada(this WebApplication app)
    {
        var api = app.MapGroup("/api");
        api.MapGet("/session", async (ClaimsPrincipal principal, UserManager<Organizer> users, PeladaDb db, IConfiguration config) =>
        {
            var user = await users.GetUserAsync(principal);
            return Results.Ok(new { User = user is { IsActive: true } ? UserDto(user) : null,
                NeedsSetup = !await db.Users.AnyAsync(), SetupEnabled = config["SETUP_TOKEN"]?.Length >= 24 });
        });
        api.MapPost("/register", Register).RequireRateLimiting("auth");
        api.MapGet("/public/state", async (PeladaDb db) =>
        {
            var doc=await db.Pelada.AsNoTracking().SingleAsync(s=>s.Id==1);
            var state=JsonSerializer.Deserialize<PeladaState>(doc.Payload,PeladaRules.Json)!;
            // Public financial views omit organizer identities and import metadata; drafts stay private.
            return Results.Ok(new {doc.Revision,State=new {
                Players=state.Players.Select(p=>new {p.Id,p.Name,Level=0,p.InitialRentals}),
                Rentals=state.Rentals.Where(r=>r.FinishedAt is not null && r.CancelledAt is null).Select(r=>r with {ImportSourceId=null}),
                MonthlyFees=state.MonthlyFees.Select(m=>new {m.Month,m.Amount,Charges=m.Charges.Select(c=>new {
                    c.PlayerId,c.PlayerName,ImportedPaid=c.PaidAt is not null || c.ImportedPaid})}),
                Incomes=state.Incomes.Select(e=>new {e.Id,e.Date,e.Amount,e.Description}),
                Expenses=state.Expenses.Select(e=>new {e.Id,e.Date,e.Amount,e.Description}),
                Teams=Array.Empty<Team>(),Matches=Array.Empty<Match>()
            }});
        });
        api.MapPost("/login", async (Login input, UserManager<Organizer> users, SignInManager<Organizer> signIn) =>
        {
            ApiError.Require(Nickname.IsValid(input.Nick) && input.Password is { Length: <= 128 }, "Nick ou senha inválidos.", 401);
            var user = await users.FindByNameAsync(Nickname.Normalize(input.Nick!));
            // A dummy password hash avoids skipping password work for an unknown account.
            if (user is null || !user.IsActive)
            {
                new PasswordHasher<Organizer>().VerifyHashedPassword(new Organizer(), DummyPasswordHash.Value, input.Password!);
                throw new ApiError(401, "Nick ou senha inválidos.");
            }
            var result = await signIn.CheckPasswordSignInAsync(user, input.Password!, lockoutOnFailure: true);
            ApiError.Require(result.Succeeded, "Nick ou senha inválidos ou conta temporariamente bloqueada.", 401);
            await signIn.SignInAsync(user, isPersistent: true);
            return Results.Ok(new { User = UserDto(user) });
        }).RequireRateLimiting("auth");

        var authorized = api.MapGroup("").RequireAuthorization();
        authorized.MapPost("/logout", async (ClaimsPrincipal principal, UserManager<Organizer> users, SignInManager<Organizer> signIn) =>
        {
            var user = await Current(principal, users);
            await users.UpdateSecurityStampAsync(user);
            await signIn.SignOutAsync();
            return Results.Ok(new { Ok = true });
        });
        authorized.MapGet("/state", async (PeladaDb db) =>
        {
            var doc = await db.Pelada.AsNoTracking().SingleAsync(s => s.Id == 1);
            return Results.Ok(new { doc.Revision, State = JsonSerializer.Deserialize<PeladaState>(doc.Payload, PeladaRules.Json) });
        });
        authorized.MapPost("/actions", async (ActionRequest input, ClaimsPrincipal principal, UserManager<Organizer> users, PeladaDb db,
            IPhotoObjectStore objects, ILogger<PhotoStorageSettings> logger) =>
        {
            var user = await Current(principal, users);
            var doc = await db.Pelada.SingleAsync(s => s.Id == 1);
            ApiError.Require(doc.Revision == input.Revision, "Outro organizador atualizou a pelada. Revise os dados e tente novamente.", 409);
            var state = JsonSerializer.Deserialize<PeladaState>(doc.Payload, PeladaRules.Json)!;
            var description = PeladaRules.Apply(state, input, user.Id, user.Name, user.IsOwner);
            var deletedPhoto = input.Type == "deleteRental" ? await db.RentalPhotos.SingleOrDefaultAsync(p => p.RentalId == input.RentalId) : null;
            var deletedLocation = deletedPhoto is null ? null : PhotoEndpoints.Location(deletedPhoto);
            if(deletedPhoto is not null) db.RentalPhotos.Remove(deletedPhoto);
            doc.Payload = JsonSerializer.Serialize(state, PeladaRules.Json);
            doc.Revision++;
            AddActivity(db, user, description);
            // Revision is an EF concurrency token: state and audit save in one transaction.
            await db.SaveChangesAsync();
            if(deletedLocation is not null) await PhotoEndpoints.Cleanup(objects, deletedLocation, logger);
            return Results.Ok(new { doc.Revision, State = state });
        });
        authorized.MapGet("/organizers", async (PeladaDb db, long? before) =>
        {
            var query = db.Activities.AsNoTracking().AsQueryable();
            if (before.HasValue) query = query.Where(a => a.Id < before.Value);
            var activity = await query.OrderByDescending(a => a.Id).Take(31)
                .Select(a => new { a.Id, a.Action, a.Date, a.Actor.Name }).ToListAsync();
            return Results.Ok(new
            {
                Organizers = await db.Users.OrderBy(u => u.Name).Select(u => new { u.Id, u.Name, Nick = u.UserName,
                    Role = u.IsOwner ? "owner" : "organizer", Active = u.IsActive }).ToListAsync(),
                Activity = activity.Take(30),
                HasMoreActivity = activity.Count > 30
            });
        });
        authorized.MapPost("/invites", async (ClaimsPrincipal principal, UserManager<Organizer> users, PeladaDb db) =>
        {
            var user = await Current(principal, users);
            ApiError.Require(user.IsOwner, "Apenas o responsável pode convidar organizadores.", 403);
            var value = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
            var expires = DateTimeOffset.UtcNow.AddHours(24);
            db.Invitations.Add(new Invitation { Hash = Hash(value), CreatedBy = user.Id, Expires = expires });
            AddActivity(db, user, "Criou um convite de organizador");
            await db.SaveChangesAsync();
            return Results.Ok(new { Invite = value, Expires = expires });
        });
        authorized.MapPost("/organizers/reset-password", async (ResetOrganizerPassword input, ClaimsPrincipal principal, UserManager<Organizer> users, PeladaDb db) =>
        {
            var owner = await Current(principal, users);
            ApiError.Require(owner.IsOwner, "Apenas o responsável pode redefinir senhas.", 403);
            ApiError.Require(input.Password is { Length: >= 6 and <= 128 }, "Use uma senha de 6 a 128 caracteres.");
            var user = input.Id is null ? null : await users.FindByIdAsync(input.Id);
            ApiError.Require(user is { IsActive: true, IsOwner: false }, "Organizador não encontrado.", 404);
            await using var transaction = await db.Database.BeginTransactionAsync();
            var token = await users.GeneratePasswordResetTokenAsync(user!);
            var result = await users.ResetPasswordAsync(user!, token, input.Password!);
            ApiError.Require(result.Succeeded, "Não foi possível redefinir a senha.", 409);
            ApiError.Require((await users.ResetAccessFailedCountAsync(user!)).Succeeded, "Não foi possível redefinir a senha.", 409);
            ApiError.Require((await users.SetLockoutEndDateAsync(user!, null)).Succeeded, "Não foi possível redefinir a senha.", 409);
            AddActivity(db, owner, $"Redefiniu a senha de {user!.Name}");
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Ok(new { Ok = true });
        });
        authorized.MapPost("/revoke", async (Revoke input, ClaimsPrincipal principal, UserManager<Organizer> users, PeladaDb db) =>
        {
            var owner = await Current(principal, users);
            ApiError.Require(owner.IsOwner, "Apenas o responsável pode remover acessos.", 403);
            ApiError.Require(input.Id != owner.Id, "Você não pode remover seu próprio acesso.");
            var user = input.Id is null ? null : await users.FindByIdAsync(input.Id);
            ApiError.Require(user is { IsActive: true, IsOwner: false }, "Organizador não encontrado.", 404);
            await using var transaction = await db.Database.BeginTransactionAsync();
            user!.IsActive = false;
            var result = await users.UpdateSecurityStampAsync(user);
            ApiError.Require(result.Succeeded, "Não foi possível remover o acesso.", 409);
            AddActivity(db, owner, $"Removeu o acesso de {user.Name}");
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Ok(new { Ok = true });
        });
    }

    private static readonly Lazy<string> DummyPasswordHash = new(() => new PasswordHasher<Organizer>()
        .HashPassword(new Organizer(), Convert.ToHexString(RandomNumberGenerator.GetBytes(32))));

    private static async Task<IResult> Register(Registration input, PeladaDb db, UserManager<Organizer> users,
        SignInManager<Organizer> signIn, IConfiguration config)
    {
        ApiError.Require(!string.IsNullOrWhiteSpace(input.Name) && input.Name.Trim().Length <= 50, "Informe um nome com até 50 caracteres.");
        ApiError.Require(Nickname.IsValid(input.Nick), "Use um nick de 3 a 24 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.");
        ApiError.Require(input.Password is { Length: >= 6 and <= 128 }, "Use uma senha de 6 a 128 caracteres.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Serialize bootstrap and invite consumption across API processes.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(849532001)");
        var first = !await db.Users.AnyAsync();
        Invitation? invitation = null;
        if (first)
        {
            var setupToken = config["SETUP_TOKEN"];
            ApiError.Require(setupToken is { Length: >= 24 }, "Habilite a configuração inicial no servidor.", 503);
            ApiError.Require(input.SetupToken is not null && CryptographicOperations.FixedTimeEquals(
                SHA256.HashData(Encoding.UTF8.GetBytes(input.SetupToken)), SHA256.HashData(Encoding.UTF8.GetBytes(setupToken!))), "Chave de configuração inválida.", 403);
        }
        else
        {
            ApiError.Require(input.Invite is { Length: 64 }, "Você precisa de um convite válido.", 403);
            invitation = await db.Invitations.FindAsync(Hash(input.Invite!));
            ApiError.Require(invitation is { Used: false } && invitation.Expires > DateTimeOffset.UtcNow, "Convite expirado ou já utilizado.", 403);
        }
        var nick = Nickname.Normalize(input.Nick!);
        ApiError.Require(await users.FindByNameAsync(nick) is null, "Este nick já está em uso. Escolha outro.", 409);
        var user = new Organizer { UserName = nick, Name = input.Name!.Trim(), IsOwner = first };
        var result = await users.CreateAsync(user, input.Password!);
        ApiError.Require(result.Succeeded, "Não foi possível criar a conta. Verifique o nick e a senha.", 409);
        if (invitation is not null) invitation.Used = true;
        AddActivity(db, user, first ? "Criou a pelada compartilhada" : "Entrou como organizador");
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        await signIn.SignInAsync(user, isPersistent: true);
        return Results.Ok(new { User = UserDto(user) });
    }
}
