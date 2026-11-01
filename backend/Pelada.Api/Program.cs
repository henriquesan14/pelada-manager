using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Pelada.Api;

if (args.Contains("--healthcheck"))
{
    try { var healthPort=Environment.GetEnvironmentVariable("PORT") ?? "8080"; using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) }; return (await client.GetAsync($"http://localhost:{healthPort}/api/health")).IsSuccessStatusCode ? 0 : 1; }
    catch { return 1; }
}
var builder = WebApplication.CreateBuilder(args);
if (builder.Configuration["PORT"] is string railwayPort)
{
    if (!int.TryParse(railwayPort,out var port) || port is <1 or >65535)
        throw new InvalidOperationException("PORT deve ser uma porta válida.");
    builder.WebHost.ConfigureKestrel(options=>options.ListenAnyIP(port));
}
var connection = builder.Configuration.GetConnectionString("Postgres") ?? throw new InvalidOperationException("Configure ConnectionStrings__Postgres.");
var origin = builder.Configuration["APP_ORIGIN"]?.TrimEnd('/') ?? "http://localhost:4200";
if (!Uri.TryCreate(origin, UriKind.Absolute, out var publicUri) || (!builder.Environment.IsDevelopment() && publicUri.Scheme != "https"))
    throw new InvalidOperationException("Configure APP_ORIGIN com um endereço HTTPS em produção.");
builder.Services.AddDbContext<PeladaDb>(options => options.UseNpgsql(connection));
var photoSettings = new PhotoStorageSettings(builder.Configuration);
photoSettings.Validate();
builder.Services.AddSingleton(photoSettings);
builder.Services.AddSingleton<IS3PhotoClientFactory, S3PhotoClientFactory>();
builder.Services.AddSingleton<IPhotoObjectStore, S3PhotoObjectStore>();
builder.Services.AddIdentity<Organizer, IdentityRole>(options =>
{
    options.User.RequireUniqueEmail = false;
    options.User.AllowedUserNameCharacters = Nickname.AllowedCharacters;
    options.Password.RequiredLength = 12;
    options.Password.RequireDigit = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireNonAlphanumeric = false;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
}).AddEntityFrameworkStores<PeladaDb>().AddDefaultTokenProviders();
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "resenha_session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = publicUri.Scheme == "https" ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    options.ExpireTimeSpan = TimeSpan.FromDays(7);
    options.SlidingExpiration = false;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return context.Response.WriteAsJsonAsync(new { Error = "Entre na sua conta para continuar." }); };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return context.Response.WriteAsJsonAsync(new { Error = "Acesso negado." }); };
});
builder.Services.Configure<SecurityStampValidatorOptions>(options => options.ValidationInterval = TimeSpan.Zero);
builder.Services.AddDataProtection().PersistKeysToDbContext<PeladaDb>()
    .SetApplicationName("Resenha");
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
    options.OnRejected = async (context, cancellation) =>
    { context.HttpContext.Response.StatusCode = 429; await context.HttpContext.Response.WriteAsJsonAsync(new { Error = "Muitas tentativas. Aguarde 10 minutos." }, cancellation); };
});
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 10 * 1024 * 1024);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options => options.MultipartBodyLengthLimit = 9 * 1024 * 1024);
var app = builder.Build();
if (args.Length == 2 && args[0] == "--import-excel-history")
{
    try {return await ExcelHistoryImport.RunAsync(app.Services,args[1]);}
    catch (Exception error) {Console.Error.WriteLine(error is ApiError ? error.Message : $"Falha de importação: {error.GetType().Name}.");Console.Error.WriteLine("Importação interrompida. Nenhuma alteração parcial foi salva no banco.");return 1;}
    finally {await app.DisposeAsync();}
}
if (args.Contains("--check-s3"))
{
    try { return await S3PhotoProbe.RunAsync(app.Services.GetRequiredService<IPhotoObjectStore>(), Console.Out); }
    finally { await app.DisposeAsync(); }
}
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers.XContentTypeOptions = "nosniff";
    try
    {
        if (HttpMethods.IsPost(context.Request.Method))
        {
            ApiError.Require(context.Request.Headers.Origin == origin && context.Request.Headers["X-Resenha-Client"] == "1", "Origem não autorizada.", 403);
            var photoUpload = context.Request.Path.StartsWithSegments("/api/rentals") && context.Request.Path.Value!.EndsWith("/photo", StringComparison.Ordinal);
            ApiError.Require(photoUpload || context.Request.HasJsonContentType(), "Envie JSON.", 415);
        }
        await next(context);
    }
    catch (ApiError error) { context.Response.StatusCode = error.Status; await context.Response.WriteAsJsonAsync(new { Error = error.Message }); }
    catch (DbUpdateConcurrencyException) { context.Response.StatusCode = 409; await context.Response.WriteAsJsonAsync(new { Error = "Outro organizador atualizou os dados. Revise e tente novamente." }); }
    catch (BadHttpRequestException error) { context.Response.StatusCode = error.StatusCode; await context.Response.WriteAsJsonAsync(new { Error = "Requisição inválida." }); }
    catch (InvalidDataException) { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { Error = "Arquivo ou formulário inválido." }); }
    catch (PhotoStorageUnavailableException error) { context.Response.StatusCode = 503; await context.Response.WriteAsJsonAsync(new { Error = error.Message }); }
    catch (Exception error)
    {
        app.Logger.LogError(error, "Falha ao processar a requisição");
        context.Response.StatusCode = 500;
        await context.Response.WriteAsJsonAsync(new { Error = "Não foi possível concluir a operação." });
    }
});
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/api/health", async (PeladaDb db) => await db.Database.CanConnectAsync() ? Results.Ok(new { Status = "ok" }) : Results.StatusCode(503));
app.MapPelada();
app.MapRentalPhotos();
await using (var scope = app.Services.CreateAsyncScope())
{
    var db=scope.ServiceProvider.GetRequiredService<PeladaDb>();
    await db.Database.MigrateAsync();
    await SessionKeyImport.ImportAsync(db,builder.Configuration["DATA_PROTECTION_PATH"] ?? "keys");
}
await app.RunAsync();
return 0;

public partial class Program;
