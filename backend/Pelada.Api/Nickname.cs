using System.Text.RegularExpressions;

namespace Pelada.Api;

public static partial class Nickname
{
    public const string AllowedCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-";
    [GeneratedRegex("\\A[a-zA-Z0-9._-]{3,24}\\z")]
    private static partial Regex Pattern();
    public static bool IsValid(string? value) => value is not null && Pattern().IsMatch(value.Trim());
    public static string Normalize(string value) => value.Trim().ToLowerInvariant();
}
