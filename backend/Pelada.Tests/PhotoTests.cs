using System.Text;
using Pelada.Api;
using Xunit;

namespace Pelada.Tests;

public static class PhotoFixture
{
    public static byte[] Png => File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory,"Fixtures","rental-photo.png"));
}
public sealed class PhotoTests
{
    [Fact] public void RecognizesActualPngBytes()=>Assert.Equal("image/png",PhotoEndpoints.DetectType(PhotoFixture.Png));
    [Fact] public void RejectsHtmlAndSvg()=>Assert.Throws<ApiError>(()=>PhotoEndpoints.DetectType(Encoding.UTF8.GetBytes("<svg onload='alert(1)'></svg>")));
    [Fact] public void RejectsEmptyFile()=>Assert.Throws<ApiError>(()=>PhotoEndpoints.DetectType([]));
    [Fact] public void RejectsOversizedFile()=>Assert.Throws<ApiError>(()=>PhotoEndpoints.DetectType(new byte[PhotoEndpoints.MaxBytes+1]));
    [Fact] public void RejectsTruncatedPng()=>Assert.Throws<ApiError>(()=>PhotoEndpoints.DetectType(PhotoFixture.Png[..20]));
}
