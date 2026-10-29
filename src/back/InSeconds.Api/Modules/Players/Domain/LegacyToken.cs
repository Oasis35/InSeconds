using System.Security.Cryptography;
using System.Text;

namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Hash du jeton d'un ancien cookie (<c>authToken</c>), pour reprendre ce cookie sans déconnecter le
/// joueur. Tous les appareils d'un compte partagent le même ancien jeton : il n'est donc pas à usage
/// unique, et chaque appareil qui le présente obtient sa propre session.
/// Table provisoire, supprimée avec la reprise des anciens cookies (#237).
/// </summary>
public sealed class LegacyToken
{
    private LegacyToken()
    {
    }

    public Guid PlayerId { get; private set; }

    public byte[] TokenHash { get; private set; } = null!;

    /// <summary>
    /// SHA-256 de l'ancien jeton écrit en minuscules avec tirets (format « D »), encodé en UTF-8 : le même
    /// calcul qu'en SQL, <c>sha256(convert_to("AuthToken"::text, 'UTF8'))</c>. Testé des
    /// deux côtés (<c>LegacyCookieTests</c>).
    /// </summary>
    public static byte[] HashOf(Guid authToken) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(authToken.ToString("D")));
}
