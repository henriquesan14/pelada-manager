using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Pelada.Api;

public static class PhotoEndpoints
{
    public const int MaxBytes = 8 * 1024 * 1024;
    public static string DetectType(byte[] data)
    {
        ApiError.Require(data.Length is > 0 and <= MaxBytes, "A foto deve ter até 8 MB.");
        ReadOnlySpan<byte> bytes = data;
        if (data.Length >= 24 && bytes[..8].SequenceEqual(new byte[] {137,80,78,71,13,10,26,10}) &&
            bytes.Slice(data.Length - 8, 4).SequenceEqual("IEND"u8)) return "image/png";
        if (data.Length >= 4 && data[0] == 255 && data[1] == 216 && data[2] == 255 && data[^2] == 255 && data[^1] == 217) return "image/jpeg";
        if (data.Length >= 20 && bytes[..4].SequenceEqual("RIFF"u8) && bytes.Slice(8,4).SequenceEqual("WEBP"u8)) return "image/webp";
        throw new ApiError(400, "Escolha uma foto JPEG, PNG ou WebP válida.");
    }

    public static void MapRentalPhotos(this WebApplication app)
    {
        var api = app.MapGroup("/api/rentals").RequireAuthorization();
        api.MapGet("/{id}/photo", async (string id, ClaimsPrincipal principal, PeladaDb db, IPhotoObjectStore objects, CancellationToken cancellation) =>
        {
            var doc = await db.Pelada.AsNoTracking().SingleAsync(s => s.Id == 1);
            var rental = JsonSerializer.Deserialize<PeladaState>(doc.Payload, PeladaRules.Json)!.Rentals.Find(r => r.Id == id);
            ApiError.Require(rental?.PhotoId is not null, "Foto não encontrada.", 404);
            ApiError.Require(principal.Identity?.IsAuthenticated == true || (rental!.FinishedAt is not null && rental.CancelledAt is null),
                "Foto não encontrada.",404);
            var photo = await db.RentalPhotos.AsNoTracking().SingleOrDefaultAsync(p => p.Id == rental!.PhotoId && p.RentalId == id);
            ApiError.Require(photo is not null, "Foto não encontrada.", 404);
            var location = Location(photo!);
            var bytes = location is null ? photo!.Data : await objects.GetAsync(location, cancellation);
            return Results.File(bytes, photo!.ContentType);
        }).AllowAnonymous();
        api.MapPost("/{id}/photo", async (string id, HttpRequest request, ClaimsPrincipal principal, UserManager<Organizer> users,
            PeladaDb db, PhotoStorageSettings settings, IPhotoObjectStore objects, ILogger<PhotoStorageSettings> logger, CancellationToken cancellation) =>
        {
            var user = await users.GetUserAsync(principal);
            ApiError.Require(user is { IsActive: true }, "Entre na sua conta para continuar.", 401);
            ApiError.Require(request.HasFormContentType && request.ContentType!.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase), "Envie a foto como arquivo.", 415);
            var form = await request.ReadFormAsync();
            ApiError.Require(form.Files.Count == 1 && form.Files[0].Name == "photo", "Selecione uma foto.");
            ApiError.Require(long.TryParse(form["revision"], out var revision), "Revisão inválida.");
            var file = form.Files[0];
            ApiError.Require(file.Length is > 0 and <= MaxBytes, "A foto deve ter até 8 MB.", 413);
            await using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer);
            var data = buffer.ToArray();
            var contentType = DetectType(data);
            var doc = await db.Pelada.SingleAsync(s => s.Id == 1);
            ApiError.Require(doc.Revision == revision, "Outro organizador atualizou a pelada. Revise e tente novamente.", 409);
            var state = JsonSerializer.Deserialize<PeladaState>(doc.Payload, PeladaRules.Json)!;
            var index = state.Rentals.FindIndex(r => r.Id == id);
            ApiError.Require(index >= 0, "Aluguel não encontrado.", 404);
            ApiError.Require(state.Rentals[index].CancelledAt is null, "Não é possível alterar a foto de uma pelada cancelada.");
            var photo = await db.RentalPhotos.SingleOrDefaultAsync(p => p.RentalId == id);
            var previousLocation = photo is null ? null : Location(photo);
            // Upload a new immutable key. Do not overwrite a photo another request might still reference.
            PhotoObjectLocation? uploaded = settings.UseS3 ? await objects.PutAsync(id, data, contentType, cancellation) : null;
            if (photo is null) { photo = new RentalPhoto { RentalId = id }; db.RentalPhotos.Add(photo); }
            photo.Data = uploaded is null ? data : [];
            photo.ObjectKey = uploaded?.Key; photo.BucketName = uploaded?.Bucket; photo.Region = uploaded?.Region;
            photo.ContentType = contentType; photo.UploadedBy = user!.Id; photo.UploadedAt = DateTimeOffset.UtcNow;
            state.Rentals[index] = state.Rentals[index] with { PhotoId = photo.Id };
            doc.Payload = JsonSerializer.Serialize(state, PeladaRules.Json); doc.Revision++;
            db.Activities.Add(new Activity { ActorId = user.Id, Action = $"Adicionou a foto de {state.Rentals[index].Name}" });
            try { await db.SaveChangesAsync(cancellation); }
            catch
            {
                if (uploaded is not null)
                {
                    // A lost connection can make the commit outcome uncertain. Never delete an object
                    // unless the database confirms it is not referenced.
                    try
                    {
                        using var checkTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                        var referenced = await db.RentalPhotos.AsNoTracking().AnyAsync(p => p.ObjectKey == uploaded.Key && p.BucketName == uploaded.Bucket, checkTimeout.Token);
                        if (!referenced) await Cleanup(objects, uploaded, logger);
                    }
                    catch { logger.LogWarning("Não foi possível conferir a referência de uma foto após falha de gravação."); }
                }
                throw;
            }
            if (previousLocation is not null && previousLocation != uploaded) await Cleanup(objects, previousLocation, logger);
            return Results.Ok(new { doc.Revision, State = state });
        }).DisableAntiforgery();
    }

    internal static PhotoObjectLocation? Location(RentalPhoto photo)
    {
        if (photo.ObjectKey is null) return null;
        if (string.IsNullOrWhiteSpace(photo.BucketName) || string.IsNullOrWhiteSpace(photo.Region)) throw new PhotoStorageUnavailableException();
        return new PhotoObjectLocation(photo.BucketName, photo.Region, photo.ObjectKey);
    }
    internal static async Task Cleanup(IPhotoObjectStore objects, PhotoObjectLocation location, ILogger logger)
    {
        try { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5)); await objects.DeleteAsync(location, timeout.Token); }
        catch { logger.LogWarning("Uma foto substituída ou sem referência permaneceu no S3 para limpeza posterior."); }
    }
}
