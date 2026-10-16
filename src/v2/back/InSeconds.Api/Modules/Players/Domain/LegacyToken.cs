using System.Security.Cryptography;
using System.Text;

namespace InSeconds.Api.Modules.Players.Domain;

/// <summary>
/// Hash du jeton d'un cookie v1 (<c>authToken</c>), pour reprendre ce cookie sans déconnecter le
/// joueur (§ 5.5 du plan v2). En v1, tous les appareils d'un compte partagent le même jeton : il
/// n'est donc pas à usage unique, et chaque appareil qui le présente obtient sa propre session (R1).
/// Table provisoire, supprimée au retrait de la transition (J+90, PR I3).
/// </summary>
public sealed class LegacyToken
{
    private LegacyToken()
    {
    }

    public Guid PlayerId { get; private set; }

    public byte[] TokenHash { get; private set; } = null!;

    /// <summary>
    /// SHA-256 du jeton v1 écrit en minuscules avec tirets (format « D »), encodé en UTF-8 : le même
    /// calcul que l'import, <c>sha256(convert_to("AuthToken"::text, 'UTF8'))</c> (§ 8.2). Testé des
    /// deux côtés (<c>LegacyCookieTests</c>).
    /// </summary>
    public static byte[] HashOf(Guid authToken) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(authToken.ToString("D")));
}
