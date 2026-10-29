using System.Security.Cryptography;
using System.Text;

namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Le secret d'un lien envoyé par email, calculé ainsi :
/// 32 octets aléatoires en base64url, et SHA-256 de ce texte en UTF-8 comme hash. Seul le hash est
/// stocké, en octets.
/// </summary>
public static class AuthTokenSecret
{
    public static string Generate() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

    public static byte[] Hash(string rawToken) => SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
}
