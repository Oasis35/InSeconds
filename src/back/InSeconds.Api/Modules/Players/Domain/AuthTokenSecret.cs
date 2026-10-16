using System.Security.Cryptography;
using System.Text;

namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Le secret d'un lien envoyé par email, calculé comme en v1 (<c>MagicLinkTokenGenerator</c>) :
/// 32 octets aléatoires en base64url, et SHA-256 de ce texte en UTF-8 comme hash. Seul le hash est
/// stocké ; le v1 le gardait en hexadécimal, l'import le convertit en octets (R14).
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
