using System.Collections.Concurrent;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

namespace Pelada.Api;

public sealed record PhotoObjectLocation(string Bucket, string Region, string Key);
public interface IPhotoObjectStore
{
    Task<PhotoObjectLocation> PutAsync(string rentalId, byte[] data, string contentType, CancellationToken cancellation = default);
    Task<byte[]> GetAsync(PhotoObjectLocation location, CancellationToken cancellation = default);
    Task DeleteAsync(PhotoObjectLocation location, CancellationToken cancellation = default);
}
public sealed class PhotoStorageUnavailableException : Exception
{
    public PhotoStorageUnavailableException() : base("Não foi possível acessar o S3. Confira as credenciais e as permissões da API.") { }
}
public sealed class PhotoStorageSettings(IConfiguration config)
{
    public bool UseS3 => string.Equals(config["PhotoStorage:Provider"], "S3", StringComparison.OrdinalIgnoreCase);
    public string Bucket => config["S3:Bucket"] ?? "alugueis-pelada";
    public string Region => config["S3:Region"] ?? "sa-east-1";
    public void Validate()
    {
        var provider = config["PhotoStorage:Provider"] ?? "Database";
        if (!provider.Equals("S3", StringComparison.OrdinalIgnoreCase) && !provider.Equals("Database", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("PhotoStorage:Provider deve ser S3 ou Database.");
        if (UseS3 && (string.IsNullOrWhiteSpace(Bucket) || string.IsNullOrWhiteSpace(Region)))
            throw new InvalidOperationException("Configure S3:Bucket e S3:Region.");
    }
}
public interface IS3PhotoClientFactory { IAmazonS3 GetClient(string region); }
public sealed class S3PhotoClientFactory(IConfiguration config) : IS3PhotoClientFactory, IDisposable
{
    private readonly ConcurrentDictionary<string, IAmazonS3> clients = new();
    public IAmazonS3 GetClient(string region) => clients.GetOrAdd(region, value =>
    {
        var accessKey = config["AWS:AccessKey"];
        var secretKey = config["AWS:SecretKey"];
        var sessionToken = config["AWS:SessionToken"];
        var options = new AmazonS3Config { RegionEndpoint = RegionEndpoint.GetBySystemName(value), MaxErrorRetry = 2, Timeout = TimeSpan.FromSeconds(30) };
        // Secret Manager in Development; AWS's standard credential chain and IAM roles otherwise.
        if (string.IsNullOrWhiteSpace(accessKey) && string.IsNullOrWhiteSpace(secretKey)) return new AmazonS3Client(options);
        if (string.IsNullOrWhiteSpace(accessKey) || string.IsNullOrWhiteSpace(secretKey)) throw new PhotoStorageUnavailableException();
        AWSCredentials credentials = string.IsNullOrWhiteSpace(sessionToken)
            ? new BasicAWSCredentials(accessKey, secretKey) : new SessionAWSCredentials(accessKey, secretKey, sessionToken);
        return new AmazonS3Client(credentials, options);
    });
    public void Dispose() { foreach (var client in clients.Values) client.Dispose(); }
}
public sealed class S3PhotoObjectStore(IS3PhotoClientFactory clients, PhotoStorageSettings settings) : IPhotoObjectStore
{
    public async Task<PhotoObjectLocation> PutAsync(string rentalId, byte[] data, string contentType, CancellationToken cancellation = default)
    {
        var extension = contentType switch { "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp", _ => throw new ApiError(400, "Formato de foto inválido.") };
        var location = new PhotoObjectLocation(settings.Bucket, settings.Region, $"alugueis/{rentalId}/{Guid.NewGuid():N}.{extension}");
        try
        {
            using var stream = new MemoryStream(data, writable: false);
            await clients.GetClient(location.Region).PutObjectAsync(new PutObjectRequest
            { BucketName = location.Bucket, Key = location.Key, InputStream = stream, ContentType = contentType }, cancellation);
            return location;
        }
        catch (OperationCanceledException) { throw; }
        catch { throw new PhotoStorageUnavailableException(); }
    }
    public async Task<byte[]> GetAsync(PhotoObjectLocation location, CancellationToken cancellation = default)
    {
        try
        {
            using var response = await clients.GetClient(location.Region).GetObjectAsync(new GetObjectRequest { BucketName = location.Bucket, Key = location.Key }, cancellation);
            await using var buffer = new MemoryStream();
            var chunk = new byte[81920];
            int read;
            while ((read = await response.ResponseStream.ReadAsync(chunk, cancellation)) > 0)
            {
                if (buffer.Length + read > PhotoEndpoints.MaxBytes) throw new PhotoStorageUnavailableException();
                await buffer.WriteAsync(chunk.AsMemory(0, read), cancellation);
            }
            return buffer.ToArray();
        }
        catch (OperationCanceledException) { throw; }
        catch { throw new PhotoStorageUnavailableException(); }
    }
    public async Task DeleteAsync(PhotoObjectLocation location, CancellationToken cancellation = default)
    {
        try { await clients.GetClient(location.Region).DeleteObjectAsync(new DeleteObjectRequest { BucketName = location.Bucket, Key = location.Key }, cancellation); }
        catch (OperationCanceledException) { throw; }
        catch { throw new PhotoStorageUnavailableException(); }
    }
}
