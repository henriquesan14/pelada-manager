using Pelada.Api;
using Xunit;

namespace Pelada.Tests;

public sealed class NicknameTests
{
    [Theory]
    [InlineData("rico10")]
    [InlineData("Rico.10")]
    [InlineData("goleiro_1")]
    [InlineData("camisa-10")]
    [InlineData(" abc ")]
    [InlineData("abcdefghijklmnopqrstuvwx")]
    public void AcceptsValidNicks(string nick) => Assert.True(Nickname.IsValid(nick));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("ab")]
    [InlineData("abcdefghijklmnopqrstuvwxy")]
    [InlineData("rico@example.test")]
    [InlineData("rico 10")]
    [InlineData("ricão")]
    [InlineData("rico+10")]
    public void RejectsInvalidNicks(string? nick) => Assert.False(Nickname.IsValid(nick));

    [Fact]
    public void NormalizesWhitespaceAndCase() => Assert.Equal("rico.10", Nickname.Normalize(" RICO.10 "));
}
