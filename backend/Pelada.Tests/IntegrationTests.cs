using System.Net;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Configuration;
using Pelada.Api;
using Xunit;

namespace Pelada.Tests;

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("TEST_POSTGRES") != "1")
            Skip = "Execute com compose.test.yaml para testar com PostgreSQL real.";
    }
}

public sealed class IntegrationTests
{
    private sealed class SessionTimeProvider : TimeProvider
    {
        public TimeSpan Offset { get; set; }
        public override DateTimeOffset GetUtcNow() => DateTimeOffset.UtcNow + Offset;
    }

    [PostgresFact]
    public async Task AccountsSharedResultsConcurrencyAndRevocationWorkWithPostgres()
    {
        var objects = new FakePhotoObjectStore();
        var sessionClock = new SessionTimeProvider();
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.PostConfigure<CookieAuthenticationOptions>(IdentityConstants.ApplicationScheme, options => options.TimeProvider = sessionClock);
            services.PostConfigure<SecurityStampValidatorOptions>(options => options.TimeProvider = sessionClock);
            services.RemoveAll<IPhotoObjectStore>(); services.AddSingleton<IPhotoObjectStore>(objects);
            services.RemoveAll<PhotoStorageSettings>(); services.AddSingleton(new PhotoStorageSettings(new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string,string?> { ["PhotoStorage:Provider"]="S3" }).Build()));
        }));
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        { BaseAddress = new Uri("http://localhost:4200"), HandleCookies = false, AllowAutoRedirect = false });
        async Task<HttpResponseMessage> Request(string path, object? body = null, string? cookie = null, bool foreign = false)
        {
            using var request = new HttpRequestMessage(body is null ? HttpMethod.Get : HttpMethod.Post, $"/api/{path}");
            if (body is not null)
            {
                request.Content = JsonContent.Create(body);
                request.Headers.Add("Origin", foreign ? "https://other.example" : "http://localhost:4200");
                request.Headers.Add("X-Resenha-Client", "1");
            }
            if (cookie is not null) request.Headers.Add("Cookie", cookie);
            return await client.SendAsync(request);
        }
        static string Cookie(HttpResponseMessage response) => response.Headers.GetValues("Set-Cookie")
            .Single(c => c.StartsWith("resenha_session=", StringComparison.Ordinal)).Split(';')[0];
        static async Task<JsonNode> Json(HttpResponseMessage response) => JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        async Task<HttpResponseMessage> Upload(string id, long revision, byte[] bytes, string? cookie, bool foreign=false)
        {
            using var request=new HttpRequestMessage(HttpMethod.Post,$"/api/rentals/{id}/photo");
            using var form=new MultipartFormDataContent();
            var file=new ByteArrayContent(bytes);file.Headers.ContentType=new MediaTypeHeaderValue("image/png");
            form.Add(file,"photo","test.png");form.Add(new StringContent(revision.ToString()),"revision");request.Content=form;
            request.Headers.Add("Origin",foreign?"https://other.example":"http://localhost:4200");request.Headers.Add("X-Resenha-Client","1");
            if(cookie is not null)request.Headers.Add("Cookie",cookie);
            return await client.SendAsync(request);
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("state")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await Request("public/state")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Request("actions",new{type="deleteRental",rentalId="any",revision=0})).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Request("organizers")).StatusCode);
        Assert.True((await Json(await Request("session")))["needsSetup"]!.GetValue<bool>());
        var registration = new { name = "Dono", nick = "rico10", password = "123456", setupToken = Environment.GetEnvironmentVariable("SETUP_TOKEN") };
        Assert.Equal(HttpStatusCode.Forbidden, (await Request("register", registration, foreign: true)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Request("register", new { name = "Dono", nick = "rico10", password = "12345", setupToken = Environment.GetEnvironmentVariable("SETUP_TOKEN") })).StatusCode);
        var ownerResponse = await Request("register", registration);
        Assert.Equal(HttpStatusCode.OK, ownerResponse.StatusCode);
        var ownerCookie = Cookie(ownerResponse);
        var ownerJson = await Json(ownerResponse);
        Assert.Equal("rico10", ownerJson["user"]!["nick"]!.GetValue<string>());
        Assert.False(ownerJson["user"]!.AsObject().ContainsKey("email"));
        Assert.Contains("httponly", string.Join("", ownerResponse.Headers.GetValues("Set-Cookie")).ToLowerInvariant());
        Assert.DoesNotContain("password", (await ownerResponse.Content.ReadAsStringAsync()).ToLowerInvariant());
        var badLogin = await Request("login", new { nick = "rico10", password = "wrong" });
        Assert.Equal(HttpStatusCode.Unauthorized, badLogin.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("login", new { nick = "owner@example.test", password = "Synthetic-password-123" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("login", new { email = "owner@example.test", password = "Synthetic-password-123" })).StatusCode);
        var login = await Request("login", new { nick = " RICO10 ", password = "123456" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        ownerCookie = Cookie(login);

        sessionClock.Offset = TimeSpan.FromDays(1);
        using var renewedSession = await Request("state", cookie: ownerCookie);
        Assert.Equal(HttpStatusCode.OK, renewedSession.StatusCode);
        var renewedCookie = Cookie(renewedSession);

        sessionClock.Offset = TimeSpan.FromDays(7.5);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("state", cookie: ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Request("state", cookie: renewedCookie)).StatusCode);

        sessionClock.Offset = TimeSpan.FromDays(8.5);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("state", cookie: renewedCookie)).StatusCode);
        sessionClock.Offset = TimeSpan.Zero;

        // A fresh application/service provider must accept the existing cookie.
        await using(var restarted=new WebApplicationFactory<Program>())
        {
            using var afterRestart=restarted.CreateClient(new WebApplicationFactoryClientOptions{BaseAddress=new Uri("http://localhost:4200"),HandleCookies=false});
            using var restoreSession=new HttpRequestMessage(HttpMethod.Get,"/api/session");restoreSession.Headers.Add("Cookie",ownerCookie);
            var restoredSession=await Json(await afterRestart.SendAsync(restoreSession));
            Assert.Equal("rico10",restoredSession["user"]!["nick"]!.GetValue<string>());
            await using var scope=restarted.Services.CreateAsyncScope();
            Assert.NotEmpty(await scope.ServiceProvider.GetRequiredService<PeladaDb>().DataProtectionKeys.ToListAsync());
        }
        var invite = (await Json(await Request("invites", new { }, ownerCookie)))["invite"]!.GetValue<string>();
        var duplicateNick = await Request("register", new { name = "Duplicado", nick = "RICO10", password = "Synthetic-password-123", invite });
        Assert.Equal(HttpStatusCode.Conflict, duplicateNick.StatusCode);
        Assert.Contains("nick já está em uso", await duplicateNick.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await Request("register", new { name = "Inválido", nick = "ab", password = "Synthetic-password-123", invite })).StatusCode);
        var otherResponse = await Request("register", new { name = "Outro", nick = "outro", password = "Synthetic-password-123", invite });
        Assert.Equal(HttpStatusCode.OK, otherResponse.StatusCode);
        var otherCookie = Cookie(otherResponse);
        var otherId = (await Json(otherResponse))["user"]!["id"]!.GetValue<string>();
        Assert.Equal(HttpStatusCode.Forbidden, (await Request("register", new { name = "Terceiro", nick = "terceiro", password = "Synthetic-password-123", invite })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Request("invites", new { }, otherCookie)).StatusCode);
        var resetInput = new { id = otherId, password = "654321" };
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("organizers/reset-password", resetInput)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Request("organizers/reset-password", resetInput, otherCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Request("organizers/reset-password", new { id = otherId, password = "12345" }, ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Request("organizers/reset-password", new { id = ownerJson["user"]!["id"]!.GetValue<string>(), password = "654321" }, ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Request("organizers/reset-password", resetInput, ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("state", cookie: otherCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("login", new { nick = "outro", password = "Synthetic-password-123" })).StatusCode);
        var resetLogin = await Request("login", new { nick = "outro", password = "654321" });
        Assert.Equal(HttpStatusCode.OK, resetLogin.StatusCode);
        otherCookie = Cookie(resetLogin);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var audit = await scope.ServiceProvider.GetRequiredService<PeladaDb>().Activities.OrderByDescending(a => a.Id).FirstAsync();
            Assert.Equal("Redefiniu a senha de Outro", audit.Action);
            Assert.DoesNotContain("654321", audit.Action);
        }
        var writes = await Task.WhenAll(
            Request("actions", new { type = "addPlayer", revision = 0, name = "Ana", level = 4.5m, position = "Meia" }, ownerCookie),
            Request("actions", new { type = "addPlayer", revision = 0, name = "Beto", level = 3.5m, position = "Zagueiro" }, otherCookie));
        Assert.Single(writes, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(writes, r => r.StatusCode == HttpStatusCode.Conflict);
        var current = await Json(await Request("state", cookie: otherCookie));
        Assert.Single(current["state"]!["players"]!.AsArray());
        Assert.Equal(0.5m, current["state"]!["players"]![0]!["level"]!.GetValue<decimal>() % 1);
        Assert.False(string.IsNullOrWhiteSpace(current["state"]!["players"]![0]!["position"]!.GetValue<string>()));
        Assert.Equal(HttpStatusCode.BadRequest, (await Request("actions", new { type = "addPlayer", revision = 1, name = "Inválido", level = 0.75m, position = "Meia" }, ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Request("actions", new { type = "addPlayer", revision = 1, name = "Sem posição", level = 1.5m }, ownerCookie)).StatusCode);
        var second = await Request("actions", new { type = "addPlayer", revision = 1, name = "Caio", level = 2.5m, position = "Atacante" }, ownerCookie);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        current = await Json(second);
        var ids = current["state"]!["players"]!.AsArray().Select(p => p!["id"]!.GetValue<string>()).ToArray();
        var drawn = await Request("actions", new { type = "draw", revision = 2, players = ids, count = 2 }, ownerCookie);
        Assert.Equal(HttpStatusCode.OK, drawn.StatusCode);
        var teams = (await Json(drawn))["state"]!["teams"]!.AsArray();
        var started = await Request("actions", new { type = "startRental", revision = 3, name = "Pelada de teste", playedOn = "2026-10-30" }, ownerCookie);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var rentalId = (await Json(started))["state"]!["rentals"]![0]!["id"]!.GetValue<string>();
        Assert.Equal(HttpStatusCode.BadRequest,(await Request("actions",new{type="finishRental",revision=4,rentalId,winnerTeamId=teams[0]!["id"]!.GetValue<string>()},ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Upload(rentalId,4,PhotoFixture.Png,null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Upload(rentalId,4,PhotoFixture.Png,ownerCookie,true)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await Upload(rentalId,4,"<svg></svg>"u8.ToArray(),ownerCookie)).StatusCode);
        objects.FailUploads=true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable,(await Upload(rentalId,4,PhotoFixture.Png,otherCookie)).StatusCode);
        Assert.Empty(objects.Objects);
        Assert.Equal(4,(await Json(await Request("state",cookie:ownerCookie)))["revision"]!.GetValue<int>());
        objects.FailUploads=false;
        var saved = await Upload(rentalId,4,PhotoFixture.Png,otherCookie);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        current = await Json(await Request("state", cookie: ownerCookie));
        Assert.Empty(current["state"]!["matches"]!.AsArray());
        Assert.NotNull(current["state"]!["rentals"]![0]!["photoId"]);
        Assert.Equal(HttpStatusCode.Conflict,(await Upload(rentalId,4,PhotoFixture.Png,ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Request($"rentals/{rentalId}/photo")).StatusCode);
        Assert.Empty((await Json(await Request("public/state")))["state"]!["rentals"]!.AsArray());
        var photoResponse=await Request($"rentals/{rentalId}/photo",cookie:ownerCookie);
        Assert.Equal(HttpStatusCode.OK,photoResponse.StatusCode);
        Assert.Equal("image/png",photoResponse.Content.Headers.ContentType!.MediaType);
        Assert.Equal(PhotoFixture.Png,await photoResponse.Content.ReadAsByteArrayAsync());
        var playerId = ids[0];
        var updatedPosition = await Request("actions", new { type = "updatePosition", revision = 5, id = playerId, position = "Pivô" }, otherCookie);
        Assert.Equal(HttpStatusCode.OK, updatedPosition.StatusCode);
        var updatedRating = await Request("actions", new { type = "updateLevel", revision = 6, id = playerId, level = 1.5m }, ownerCookie);
        Assert.Equal(HttpStatusCode.OK, updatedRating.StatusCode);
        var refreshed = await Json(await Request("state", cookie: otherCookie));
        var updatedPlayer = refreshed["state"]!["players"]!.AsArray().Single(p => p!["id"]!.GetValue<string>() == playerId)!;
        Assert.Equal("Pivô", updatedPlayer["position"]!.GetValue<string>());
        Assert.Equal(1.5m, updatedPlayer["level"]!.GetValue<decimal>());
        Assert.True((await Request("state", cookie: ownerCookie)).Headers.CacheControl!.NoStore);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PeladaDb>();
            Assert.Equal(7, (await db.Pelada.AsNoTracking().SingleAsync()).Revision);
            Assert.Equal("jsonb", db.Model.FindEntityType(typeof(StateDocument))!.FindProperty(nameof(StateDocument.Payload))!.GetColumnType());
            Assert.True(await db.Activities.AnyAsync(a => a.ActorId == otherId && a.Action.Contains("foto")));
            var photo=await db.RentalPhotos.SingleAsync();Assert.Empty(photo.Data);
            Assert.Equal("alugueis-pelada",photo.BucketName);Assert.Equal("sa-east-1",photo.Region);
            Assert.StartsWith($"alugueis/{rentalId}/",photo.ObjectKey!);
            Assert.Equal(PhotoFixture.Png,objects.Objects[photo.ObjectKey!]);
        }
        var finished = await Request("actions", new { type = "finishRental", revision = 7, rentalId, winnerTeamId=teams[0]!["id"]!.GetValue<string>() }, ownerCookie);
        Assert.Equal(HttpStatusCode.OK, finished.StatusCode);
        var result = (await Json(finished))["state"]!["rentals"]![0]!;
        Assert.Equal(teams[0]!["id"]!.GetValue<string>(), result["winnerTeamId"]!.GetValue<string>());
        Assert.NotNull(result["finishedAt"]);
        var publicState=await Json(await Request("public/state"));
        Assert.Single(publicState["state"]!["rentals"]!.AsArray());
        Assert.Empty(publicState["state"]!["teams"]!.AsArray());
        Assert.Empty(publicState["state"]!["matches"]!.AsArray());
        Assert.All(publicState["state"]!["players"]!.AsArray(),p=>Assert.Equal(0,p!["level"]!.GetValue<int>()));
        Assert.Equal(HttpStatusCode.OK,(await Request($"rentals/{rentalId}/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Upload(rentalId,8,PhotoFixture.Png,null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Request("actions", new { type = "finishRental", revision = 8, rentalId, winnerTeamId=teams[0]!["id"]!.GetValue<string>() }, ownerCookie)).StatusCode);
        var replaced=await Upload(rentalId,8,PhotoFixture.Png,ownerCookie);
        Assert.Equal(HttpStatusCode.OK,replaced.StatusCode);
        Assert.Single(objects.Objects);
        Assert.Equal(teams[0]!["id"]!.GetValue<string>(),(await Json(replaced))["state"]!["rentals"]![0]!["winnerTeamId"]!.GetValue<string>());
        await using(var scope=factory.Services.CreateAsyncScope())Assert.Single(await scope.ServiceProvider.GetRequiredService<PeladaDb>().RentalPhotos.ToListAsync());
        objects.AfterPut=async()=>
        {
            await using var scope=factory.Services.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<PeladaDb>().Pelada.ExecuteUpdateAsync(setters=>setters.SetProperty(s=>s.Revision,s=>s.Revision+1));
        };
        var previousKey=objects.Objects.Keys.Single();
        Assert.Equal(HttpStatusCode.Conflict,(await Upload(rentalId,9,PhotoFixture.Png,ownerCookie)).StatusCode);
        Assert.Single(objects.Objects);Assert.True(objects.Objects.ContainsKey(previousKey));objects.AfterPut=null;
        // Old photos in PostgreSQL remain readable even when S3 cannot be reached.
        await using(var scope=factory.Services.CreateAsyncScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<PeladaDb>();var legacy=await db.RentalPhotos.SingleAsync();
            legacy.Data=PhotoFixture.Png;legacy.ObjectKey=null;legacy.BucketName=null;legacy.Region=null;await db.SaveChangesAsync();
        }
        objects.FailReads=true;
        var legacyResponse=await Request($"rentals/{rentalId}/photo",cookie:ownerCookie);
        Assert.Equal(HttpStatusCode.OK,legacyResponse.StatusCode);Assert.Equal(PhotoFixture.Png,await legacyResponse.Content.ReadAsByteArrayAsync());
        objects.FailReads=false;
        Assert.Equal(HttpStatusCode.OK,(await Upload(rentalId,10,PhotoFixture.Png,ownerCookie)).StatusCode);
        string deleteKey;
        await using(var scope=factory.Services.CreateAsyncScope())deleteKey=(await scope.ServiceProvider.GetRequiredService<PeladaDb>().RentalPhotos.SingleAsync()).ObjectKey!;
        Assert.Equal(HttpStatusCode.Conflict,(await Request("actions",new{type="deleteRental",revision=10,rentalId},ownerCookie)).StatusCode);
        Assert.True(objects.Objects.ContainsKey(deleteKey));
        var deleted=await Request("actions",new{type="deleteRental",revision=11,rentalId},ownerCookie);
        Assert.Equal(HttpStatusCode.OK,deleted.StatusCode);Assert.Empty((await Json(deleted))["state"]!["rentals"]!.AsArray());
        Assert.False(objects.Objects.ContainsKey(deleteKey));
        Assert.Equal(HttpStatusCode.NotFound,(await Request($"rentals/{rentalId}/photo",cookie:ownerCookie)).StatusCode);
        await using(var scope=factory.Services.CreateAsyncScope())Assert.Empty(await scope.ServiceProvider.GetRequiredService<PeladaDb>().RentalPhotos.ToListAsync());
        Assert.Equal(HttpStatusCode.Unauthorized,(await Request("actions",new{type="openMonthlyFees",month="2026-10",revision=12})).StatusCode);
        var fees=await Request("actions",new{type="openMonthlyFees",month="2026-10",revision=12},ownerCookie);
        Assert.Equal(HttpStatusCode.OK,fees.StatusCode);
        var feeMonth=(await Json(fees))["state"]!["monthlyFees"]![0]!;
        Assert.Equal(10m,feeMonth["amount"]!.GetValue<decimal>());Assert.Equal(2,feeMonth["charges"]!.AsArray().Count);
        Assert.Equal(HttpStatusCode.OK,(await Request("actions",new{type="setMonthlyFeePayment",month="2026-10",id=ids[0],paid=true,revision=13},ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Request("actions",new{type="setMonthlyFeePayment",month="2026-10",id=ids[0],paid=false,revision=14})).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Request("actions",new{type="addExpense",expenseDate="2026-10-31",amount=5,description="Bola",revision=14})).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await Request("actions",new{type="addExpense",expenseDate="2026-10-31",amount=5,description="Bola",revision=14},ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Request("actions",new{type="addIncome",incomeDate="2026-10-31",amount=25,description="Doação",revision=15})).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await Request("actions",new{type="addIncome",incomeDate="2026-10-31",amount=25,description="Doação",revision=15},ownerCookie)).StatusCode);
        var publicFinance=(await Json(await Request("public/state")))["state"]!;
        Assert.Equal(25m,publicFinance["incomes"]![0]!["amount"]!.GetValue<decimal>());
        var publicCharge=publicFinance["monthlyFees"]![0]!["charges"]![0]!;
        Assert.True(publicCharge["importedPaid"]!.GetValue<bool>());
        Assert.False(publicCharge.AsObject().ContainsKey("recordedBy"));Assert.False(publicCharge.AsObject().ContainsKey("recordedByName"));
        Assert.False(publicCharge.AsObject().ContainsKey("importSourceCell"));Assert.False(publicCharge.AsObject().ContainsKey("paidAt"));
        Assert.Equal(5m,publicFinance["expenses"]![0]!["amount"]!.GetValue<decimal>());
        Assert.False(publicFinance["expenses"]![0]!.AsObject().ContainsKey("importSourceCell"));
        var expiredInvite = (await Json(await Request("invites", new { }, ownerCookie)))["invite"]!.GetValue<string>();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PeladaDb>();
            await db.Invitations.Where(i => !i.Used).ExecuteUpdateAsync(setters => setters.SetProperty(i => i.Expires, DateTimeOffset.UtcNow.AddDays(-1)));
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await Request("register", new { name = "Tarde", nick = "atrasado", password = "Synthetic-password-123", invite = expiredInvite })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Request("organizers/remove", new { id = otherId }, otherCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Request("organizers/remove", new { id = otherId }, ownerCookie)).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PeladaDb>();
            Assert.False(await db.Users.AnyAsync(u => u.Id == otherId));
            Assert.True(await db.Activities.AnyAsync(a => a.ActorId == otherId && a.ActorName == "Outro"));
        }
        Assert.Equal(HttpStatusCode.NotFound, (await Request("organizers/reset-password", resetInput, ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("state", cookie: otherCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("login", new { nick = "outro", password = "654321" })).StatusCode);
        // Pagination must retain every action even when new actions arrive between pages.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PeladaDb>();
            var actor = await db.Users.SingleAsync(u => u.IsOwner);
            db.Activities.AddRange(Enumerable.Range(1, 35).Select(i => new Activity { ActorId = actor.Id, ActorName = actor.Name, Action = $"Pagination {i}" }));
            await db.SaveChangesAsync();
        }
        var firstPage = await Json(await Request("organizers", cookie: ownerCookie));
        Assert.Equal(30, firstPage["activity"]!.AsArray().Count);
        Assert.True(firstPage["hasMoreActivity"]!.GetValue<bool>());
        var before = firstPage["activity"]!.AsArray().Last()!["id"]!.GetValue<long>();
        Assert.Equal(HttpStatusCode.OK, (await Request("invites", new { }, ownerCookie)).StatusCode);
        var seen = firstPage["activity"]!.AsArray().Select(a => a!["id"]!.GetValue<long>()).ToList();
        var page = firstPage;
        while (page["hasMoreActivity"]!.GetValue<bool>())
        {
            page = await Json(await Request($"organizers?before={before}", cookie: ownerCookie));
            var idsPage = page["activity"]!.AsArray().Select(a => a!["id"]!.GetValue<long>()).ToList();
            Assert.All(idsPage, id => Assert.True(id < before));
            seen.AddRange(idsPage);
            before = idsPage.Last();
        }
        Assert.Equal(seen.Count, seen.Distinct().Count());
        await using (var scope = factory.Services.CreateAsyncScope())
            Assert.Equal(await scope.ServiceProvider.GetRequiredService<PeladaDb>().Activities.CountAsync() - 1, seen.Count);
        Assert.Equal(HttpStatusCode.OK, (await Request("logout", new { }, ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request("state", cookie: ownerCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Request("health")).StatusCode);
    }
}
