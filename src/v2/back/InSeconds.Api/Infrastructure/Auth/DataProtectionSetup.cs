using System.Security.Cryptography.X509Certificates;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;

namespace InSeconds.Api.Infrastructure.Auth;

/// <summary>
/// Clés Data Protection (chiffrement du cookie) en base, dans <c>infra.data_protection_keys</c>, pour
/// survivre aux redéploiements (piège 17). En prod et en staging, elles sont chiffrées par un
/// certificat (S16) : la base ou une sauvegarde seules ne suffisent plus à fabriquer un cookie. Même
/// nom d'application qu'en v1 : les cookies v1 restent lisibles par la transition.
/// </summary>
public static class DataProtectionSetup
{
    public const string ApplicationName = "InSeconds";
    public const string CertificatePathKey = "DataProtection:CertificatePath";
    public const string CertificatePasswordKey = "DataProtection:CertificatePassword";

    /// <param name="startsServer">
    /// Faux pour une commande Wolverine (<c>codegen write</c>, lancée par la CI sans certificat) : le
    /// certificat n'est exigé que quand l'API démarre.
    /// </param>
    public static IServiceCollection AddInSecondsDataProtection(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment, bool startsServer)
    {
        var dataProtection = services.AddDataProtection()
            .SetApplicationName(ApplicationName)
            .PersistKeysToDbContext<InSecondsDbContext>();

        var path = configuration[CertificatePathKey];
        if (string.IsNullOrWhiteSpace(path))
        {
            if (startsServer && (environment.IsProduction() || environment.IsStaging()))
                throw new InvalidOperationException(
                    $"{CertificatePathKey} est requis en {environment.EnvironmentName} : les clés qui chiffrent le cookie ne doivent pas être en clair en base (S16).");
            return services;
        }

        // Clé privée gardée en mémoire seulement : rien n'est écrit dans le magasin de certificats.
        var certificate = X509CertificateLoader.LoadPkcs12FromFile(
            path, configuration[CertificatePasswordKey], X509KeyStorageFlags.EphemeralKeySet);
        // UnprotectKeysWithAnyCertificate : le certificat peut être remplacé plus tard en gardant l'ancien
        // pour relire les clés déjà chiffrées.
        dataProtection.ProtectKeysWithCertificate(certificate).UnprotectKeysWithAnyCertificate(certificate);
        return services;
    }
}
