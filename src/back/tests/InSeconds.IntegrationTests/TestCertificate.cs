using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using InSeconds.Api.Infrastructure.Auth;

namespace InSeconds.IntegrationTests;

/// <summary>
/// Certificat Data Protection jetable (S16) : exigé au démarrage de l'API en prod et en staging.
/// Écrit une seule fois par exécution des tests, dans le dossier temporaire.
/// </summary>
public static class TestCertificate
{
    private const string Password = "tests";
    private static readonly Lazy<string> Pfx = new(Create);

    /// <summary>Réglages qui le désignent, à ajouter à ceux d'une <c>ApiFactory</c>.</summary>
    public static Dictionary<string, string> Settings() => new()
    {
        [DataProtectionSetup.CertificatePathKey] = Pfx.Value,
        [DataProtectionSetup.CertificatePasswordKey] = Password,
    };

    /// <summary>Réglages exigés au démarrage en staging : clé Brevo, redirection des emails, certificat.</summary>
    public static Dictionary<string, string> StagingSettings() => new(Settings())
    {
        ["Brevo:ApiKey"] = "clé",
        ["EmailRedirect:To"] = "moi+staging@example.com",
    };

    private static string Create()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=InSeconds tests", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(1));
        var path = Path.Combine(Path.GetTempPath(), $"inseconds-dataprotection-{Guid.NewGuid():N}.pfx");
        File.WriteAllBytes(path, certificate.Export(X509ContentType.Pfx, Password));
        return path;
    }
}
