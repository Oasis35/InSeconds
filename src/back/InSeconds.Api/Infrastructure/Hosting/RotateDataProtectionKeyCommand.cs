using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection.KeyManagement;

namespace InSeconds.Api.Infrastructure.Hosting;

/// <summary>
/// <c>dotnet InSeconds.Api.dll --rotate-data-protection-key</c> : crée une clé Data Protection neuve,
/// tout de suite active, puis s'arrête. Rien d'autre ne démarre (comme <c>--migrate-only</c>).
///
/// À lancer <b>juste après chaque import</b> des données v1 (PR B4). L'import copie les clés de la v1,
/// <b>en clair</b> (la v1 ne les chiffre pas) : sans clé neuve, la plus récente d'entre elles encore
/// valable (jusqu'à 90 jours) deviendrait la clé par défaut de la v2, et chiffrerait les nouveaux cookies
/// avec une clé lisible en base, ce que S16 doit éviter. La clé créée ici passe par le chiffrement du
/// certificat (<see cref="DataProtectionSetup"/>) et devient la clé par défaut ; les clés de la v1 restent
/// en place, pour relire les cookies v1 jusqu'à leur remplacement.
/// </summary>
public static class RotateDataProtectionKeyCommand
{
    public const string Flag = "--rotate-data-protection-key";

    /// <summary>Durée de vie d'une clé : celle que Data Protection donne lui-même à ses clés.</summary>
    public static readonly TimeSpan KeyLifetime = TimeSpan.FromDays(90);

    public static bool IsRequested(string[] args) => args.Contains(Flag, StringComparer.Ordinal);

    public static Task<int> RunAsync(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args.Where(a => a != Flag).ToArray());
        var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection manquante.");

        // La base et Data Protection seulement (certificat exigé en prod et en staging) : le host n'est jamais
        // démarré, aucun service hébergé ne tourne.
        builder.Services.AddInSecondsDatabase(connectionString);
        builder.Services.AddInSecondsDataProtection(builder.Configuration, builder.Environment, startsServer: true);
        using var host = builder.Build();

        var logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(RotateDataProtectionKeyCommand));
        var now = (host.Services.GetService<TimeProvider>() ?? TimeProvider.System).GetUtcNow();
        var key = host.Services.GetRequiredService<IKeyManager>().CreateNewKey(now, now + KeyLifetime);
        logger.LogInformation("Clé Data Protection {KeyId} créée, active jusqu'au {Expiration:O}", key.KeyId, key.ExpirationDate);
        return Task.FromResult(0);
    }
}
