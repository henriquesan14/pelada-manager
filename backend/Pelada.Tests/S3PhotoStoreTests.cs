using System.Net;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Configuration;
using Pelada.Api;
using Xunit;

namespace Pelada.Tests;

public sealed class S3PhotoStoreTests
{
    private sealed class TestS3Client : AmazonS3Client, IS3PhotoClientFactory
    {
        public TestS3Client() : base(new AnonymousAWSCredentials(), RegionEndpoint.SAEast1) { }
        public Dictionary<string, byte[]> Objects { get; } = [];
        public string? LastBucket { get; private set; }
        public string? LastRegion { get; private set; }
        public string? LastContentType { get; private set; }
        public string? LastAcl { get; private set; }
        public bool FailUploads { get; set; }
        public IAmazonS3 GetClient(string region) { LastRegion = region; return this; }
        public override async Task<PutObjectResponse> PutObjectAsync(PutObjectRequest request, CancellationToken cancellationToken = default)
        {
            if (FailUploads) throw new AmazonS3Exception("Synthetic secret must not appear in the public error");
            LastBucket = request.BucketName; LastContentType = request.ContentType; LastAcl = request.CannedACL?.Value;
            using var buffer = new MemoryStream(); await request.InputStream.CopyToAsync(buffer, cancellationToken);
            Objects[request.Key] = buffer.ToArray(); return new PutObjectResponse { HttpStatusCode = HttpStatusCode.OK };
        }
        public override Task<GetObjectResponse> GetObjectAsync(GetObjectRequest request, CancellationToken cancellationToken = default) =>
            Task.FromResult(new GetObjectResponse { ResponseStream = new MemoryStream(Objects[request.Key]), HttpStatusCode = HttpStatusCode.OK });
        public override Task<DeleteObjectResponse> DeleteObjectAsync(DeleteObjectRequest request, CancellationToken cancellationToken = default)
        { Objects.Remove(request.Key); return Task.FromResult(new DeleteObjectResponse { HttpStatusCode = HttpStatusCode.NoContent }); }
    }
    private static S3PhotoObjectStore Store(TestS3Client client) => new(client, new PhotoStorageSettings(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>
        { ["PhotoStorage:Provider"]="S3", ["S3:Bucket"]="alugueis-pelada", ["S3:Region"]="sa-east-1" }).Build()));

    [Fact]
    public async Task UsesPrivateImmutableKeysInTheConfiguredBucket()
    {
        using var client = new TestS3Client(); var store = Store(client);
        var first = await store.PutAsync("r1", PhotoFixture.Png, "image/png");
        var second = await store.PutAsync("r1", PhotoFixture.Png, "image/png");
        Assert.Equal("alugueis-pelada", client.LastBucket); Assert.Equal("sa-east-1", client.LastRegion);
        Assert.Equal("image/png", client.LastContentType); Assert.True(client.LastAcl is null or "private");
        Assert.StartsWith("alugueis/r1/", first.Key); Assert.EndsWith(".png", first.Key); Assert.NotEqual(first.Key, second.Key);
        Assert.Equal(PhotoFixture.Png, await store.GetAsync(first));
        await store.DeleteAsync(first); Assert.False(client.Objects.ContainsKey(first.Key)); Assert.True(client.Objects.ContainsKey(second.Key));
    }
    [Fact]
    public async Task DoesNotExposeAwsErrorDetails()
    {
        using var client = new TestS3Client { FailUploads = true };
        var error = await Assert.ThrowsAsync<PhotoStorageUnavailableException>(() => Store(client).PutAsync("r1", PhotoFixture.Png, "image/png"));
        Assert.DoesNotContain("Synthetic secret", error.ToString());
    }
    [Fact]
    public async Task ProbeCleansItsOwnObjectAndRejectsReadFailures()
    {
        var objects = new FakePhotoObjectStore(); using var output = new StringWriter();
        Assert.Equal(0, await S3PhotoProbe.RunAsync(objects, output)); Assert.Empty(objects.Objects);
        objects.FailReads = true; Assert.Equal(1, await S3PhotoProbe.RunAsync(objects, output)); Assert.Empty(objects.Objects);
    }
    [Fact]
    public void SecretManagerKeysCreateClientWithoutPuttingCredentialsInBucketSettings()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>
            { ["AWS:AccessKey"]="synthetic-access-key", ["AWS:SecretKey"]="synthetic-secret-key" }).Build();
        using var factory=new S3PhotoClientFactory(config);
        Assert.Equal("sa-east-1",factory.GetClient("sa-east-1").Config.RegionEndpoint.SystemName);
        Assert.Same(factory.GetClient("sa-east-1"),factory.GetClient("sa-east-1"));
        var partial=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["AWS:AccessKey"]="synthetic-access-key" }).Build();
        using var invalid=new S3PhotoClientFactory(partial);
        Assert.Throws<PhotoStorageUnavailableException>(()=>invalid.GetClient("sa-east-1"));
    }
}
