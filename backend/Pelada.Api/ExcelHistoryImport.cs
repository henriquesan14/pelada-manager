using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Pelada.Api;

public sealed record ExcelPlayerTotal(string Name, int Total);
public sealed record ExcelHistoryEntry(string SourceId, DateOnly PlayedOn, string Location, string ParticipantsText,
    string SourcePhotoUrl, string? PhotoBase64);
public sealed record ExcelHistoryPackage(List<ExcelPlayerTotal> Players, List<ExcelHistoryEntry> History);

public static class ExcelHistoryImport
{
    public static async Task<int> RunAsync(IServiceProvider services, string path)
    {
        var package = JsonSerializer.Deserialize<ExcelHistoryPackage>(await File.ReadAllTextAsync(path), PeladaRules.Json)
            ?? throw new InvalidDataException("Arquivo de importação inválido.");
        ApiError.Require(package.Players.Count is > 0 and <= 500 && package.History.Count <= 1000, "Tamanho de importação inválido.");
        ApiError.Require(package.Players.Select(p=>p.Name.Trim().ToUpperInvariant()).Distinct().Count()==package.Players.Count,
            "Jogadores duplicados no saldo inicial.");
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PeladaDb>();
        var objects = scope.ServiceProvider.GetRequiredService<IPhotoObjectStore>();
        ApiError.Require(scope.ServiceProvider.GetRequiredService<PhotoStorageSettings>().UseS3, "Ative o S3 para importar as fotos.");
        var doc = await db.Pelada.SingleAsync(s=>s.Id==1);
        var state = JsonSerializer.Deserialize<PeladaState>(doc.Payload, PeladaRules.Json)!;
        var actor = await db.Users.Where(u=>u.IsOwner).OrderBy(u=>u.Id).FirstAsync();
        foreach(var total in package.Players)
        {
            ApiError.Require(total.Total is >= 0 and <= 100000, "Saldo inicial inválido.");
            var index=state.Players.FindIndex(p=>p.Name.Trim().Equals(total.Name.Trim(),StringComparison.OrdinalIgnoreCase));
            ApiError.Require(index>=0,"Um jogador da planilha não está cadastrado. A importação foi interrompida.");
            state.Players[index]=state.Players[index] with {InitialRentals=total.Total};
        }
        // Validate the entire package before uploading objects or changing stored data.
        foreach(var entry in package.History)
        {
            ApiError.Require(entry.SourceId.StartsWith("caps-fc-history-row-",StringComparison.Ordinal) && entry.SourceId.Length<=100,
                "Identificador de histórico inválido.");
            ApiError.Require(entry.PlayedOn!=DateOnly.MinValue && entry.Location.Length<=120 && entry.ParticipantsText.Length<=20000,
                "Registro de histórico inválido.");
            ApiError.Require(Uri.TryCreate(entry.SourcePhotoUrl,UriKind.Absolute,out var url)&&url.Scheme=="https","Link de foto inválido.");
            if(entry.PhotoBase64 is not null) PhotoEndpoints.DetectType(Convert.FromBase64String(entry.PhotoBase64));
        }
        ApiError.Require(package.History.Select(e=>e.SourceId).Distinct().Count()==package.History.Count,"Histórico duplicado no arquivo.");
        var imported=0;var photos=0;var skipped=0;
        foreach(var entry in package.History)
        {
            if(state.Rentals.Any(r=>r.ImportSourceId==entry.SourceId)){skipped++;continue;}
            var id = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes(entry.SourceId))[..16]).ToString();
            ApiError.Require(!state.Rentals.Any(r=>r.Id==id),"Identificador já utilizado.");
            var date = new DateTimeOffset(entry.PlayedOn.ToDateTime(new TimeOnly(12,0)),TimeSpan.Zero);
            string? photoId=null;
            if(entry.PhotoBase64 is not null)
            {
                var bytes=Convert.FromBase64String(entry.PhotoBase64);var type=PhotoEndpoints.DetectType(bytes);
                var location=await objects.PutAsync(id,bytes,type);
                var photo=new RentalPhoto{RentalId=id,ObjectKey=location.Key,BucketName=location.Bucket,Region=location.Region,
                    ContentType=type,Data=[],UploadedBy=actor.Id,UploadedAt=DateTimeOffset.UtcNow};
                db.RentalPhotos.Add(photo);photoId=photo.Id;photos++;
            }
            state.Rentals.Add(new Rental(id,$"Pelada de {entry.PlayedOn:dd/MM/yyyy}",date,[],FinishedAt:date,PhotoId:photoId,
                PlayedOn:entry.PlayedOn,Location:entry.Location,IsHistorical:true,ParticipantsText:entry.ParticipantsText,
                ImportSourceId:entry.SourceId,SourcePhotoUrl:entry.SourcePhotoUrl));
            imported++;
            Console.WriteLine($"Histórico preparado: {imported}/{package.History.Count-skipped}.");
        }
        doc.Payload=JsonSerializer.Serialize(state,PeladaRules.Json);doc.Revision++;
        db.Activities.Add(new Activity{ActorId=actor.Id,Action=$"Importou saldo inicial de {package.Players.Count} jogadores e {imported} aluguéis históricos, sem duplicar conquistas"});
        // EF saves metadata, state and audit atomically; its revision token rejects concurrent changes.
        await db.SaveChangesAsync();
        Console.WriteLine($"Importação concluída: {package.Players.Count} saldos, {imported} históricos, {photos} fotos no S3, {skipped} registros já importados.");
        return 0;
    }
}
