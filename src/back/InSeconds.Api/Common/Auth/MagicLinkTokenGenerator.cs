using System.Security.Cryptography;

namespace InSeconds.Api.Common.Auth;

// Partie pure de MagicLinkTokenService (pas de dépendance EF) — testable en isolation.
public static class MagicLinkTokenGenerator
{
    public static string GenerateRawToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    public static string Hash(string rawToken)
    {
        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes);
    }
}
