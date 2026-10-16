using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using InSeconds.Api.Infrastructure.Auth;

namespace InSeconds.MigrationTests;

/// <summary>
/// Certificat Data Protection jetable (S16), écrit une seule fois par exécution des tests dans le dossier
/// temporaire : celui qui chiffre les clés de la v2, comme en prod et en staging.
/// </summary>
public static class TestCertificate
{
    public const string Password = "tests";

    private static readonly Lazy<string> Pfx = new(Create);

    public static string Path => Pfx.Value;

    /// <summary>Réglages qui le désignent, pour une API de test.</summary>
    public static Dictionary<string, string> Settings() => new()
    {
        [DataProtectionSetup.CertificatePathKey] = Path,
        [DataProtectionSetup.CertificatePasswordKey] = Password,
    };

    /// <summary>Arguments de ligne de commande qui désignent le certificat (<c>--rotate-data-protection-key</c>).</summary>
    public static string[] Arguments() =>
    [
        $"--{DataProtectionSetup.CertificatePathKey}={Path}",
        $"--{DataProtectionSetup.CertificatePasswordKey}={Password}",
    ];

    private static string Create()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=InSeconds tests", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(1));
        var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"inseconds-dataprotection-{Guid.NewGuid():N}.pfx");
        File.WriteAllBytes(path, certificate.Export(X509ContentType.Pfx, Password));
        return path;
    }
}
