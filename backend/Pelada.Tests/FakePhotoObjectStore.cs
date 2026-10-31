using System.Collections.Concurrent;
using Pelada.Api;

namespace Pelada.Tests;

public sealed class FakePhotoObjectStore : IPhotoObjectStore
{
    public ConcurrentDictionary<string, byte[]> Objects { get; } = new();
    public bool FailUploads { get; set; }
    public bool FailReads { get; set; }
    public Func<Task>? AfterPut { get; set; }
    public async Task<PhotoObjectLocation> PutAsync(string rentalId, byte[] data, string contentType, CancellationToken cancellation = default)
    {
        if (FailUploads) throw new PhotoStorageUnavailableException();
        var location = new PhotoObjectLocation("alugueis-pelada", "sa-east-1", $"alugueis/{rentalId}/{Guid.NewGuid():N}.png");
        Objects[location.Key] = data.ToArray();
        if (AfterPut is not null) await AfterPut();
        return location;
    }
    public Task<byte[]> GetAsync(PhotoObjectLocation location, CancellationToken cancellation = default)
    {
        if (FailReads || !Objects.TryGetValue(location.Key, out var data)) throw new PhotoStorageUnavailableException();
        return Task.FromResult(data.ToArray());
    }
    public Task DeleteAsync(PhotoObjectLocation location, CancellationToken cancellation = default) { Objects.TryRemove(location.Key, out _); return Task.CompletedTask; }
}
