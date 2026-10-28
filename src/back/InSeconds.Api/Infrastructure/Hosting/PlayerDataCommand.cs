using System.Text.Json;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Settings;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Catalogue.Persistence;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Auth;
using InSeconds.Api.Modules.Players.Domain;
using InSeconds.Api.Modules.Players.Persistence;

namespace InSeconds.Api.Infrastructure.Hosting;

/// <summary>
/// Commandes de secours des droits RGPD, pour une demande reçue par email d'un joueur qui ne peut plus se connecter (le profil a ses
/// propres boutons) :
/// <list type="bullet">
/// <item><c>--export-player &lt;email&gt;</c> écrit la copie de ses données (le même JSON que le bouton du profil) sur la sortie standard ;</item>
/// <item><c>--delete-player &lt;email&gt;</c> efface son compte (le même code que le bouton du profil et la purge des comptes inactifs).</item>
/// </list>
/// Rien d'autre ne démarre (comme <c>--migrate-only</c>). Les journaux vont sur la sortie d'erreur, jamais mêlés au JSON, et ne portent
/// jamais l'adresse. Code de sortie : 0, 2 si aucun compte n'a cette adresse, 64 si l'adresse manque.
/// </summary>
public static class PlayerDataCommand
{
    public const string ExportFlag = "--export-player";
    public const string DeleteFlag = "--delete-player";

    public const int NotFound = 2;
    public const int Usage = 64;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public static bool IsRequested(string[] args) => args.Contains(ExportFlag, StringComparer.Ordinal) || args.Contains(DeleteFlag, StringComparer.Ordinal);

    /// <param name="output">La sortie de l'export : la sortie standard, sauf en test.</param>
    public static async Task<int> RunAsync(string[] args, TextWriter? output = null, CancellationToken cancellationToken = default)
    {
        var flag = args.Contains(ExportFlag, StringComparer.Ordinal) ? ExportFlag : DeleteFlag;
        var index = Array.IndexOf(args, flag);
        var email = index + 1 < args.Length && !args[index + 1].StartsWith("--", StringComparison.Ordinal) ? args[index + 1] : null;
        var rest = args.Where((_, i) => i != index && (email is null || i != index + 1)).ToArray();

        var builder = Host.CreateApplicationBuilder(rest);
        builder.Logging.ClearProviders();
        builder.Logging.AddConsole(options => options.LogToStandardErrorThreshold = LogLevel.Trace);
        var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection manquante.");

        // La base, les réglages (modèle d'adresse des pochettes) et ce que chaque mode contribue aux droits d'un joueur : ni
        // serveur, ni Wolverine, ni Hangfire. Le cache de validation des cookies vit dans le processus de l'API, pas ici : un appareil
        // supprimé y est refusé au plus une minute plus tard.
        builder.AddDatabaseSettings(connectionString);
        builder.Services.AddInSecondsDatabase(connectionString);
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddOptions<CatalogueOptions>().BindConfiguration(CatalogueOptions.Section);
        builder.Services.AddScoped<ITrackDirectory, EfTrackDirectory>();
        // Les contributeurs des modes, enregistrés comme dans l'API (une seule liste, ApiComposition).
        builder.Services.AddPlayerDataContributors();
        builder.Services.AddScoped<IPlayerStore, EfPlayerStore>();
        builder.Services.AddScoped<IPlayerQueries, EfPlayerQueries>();
        builder.Services.AddSingleton<IDeviceSessionValidationCache, NoValidationCache>();
        builder.Services.AddScoped<PlayerDataExporter>();
        builder.Services.AddScoped<AccountErasure>();
        using var host = builder.Build();

        var logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(PlayerDataCommand));
        if (string.IsNullOrWhiteSpace(email))
        {
            logger.LogError("Adresse manquante : {Flag} <email>", flag);
            return Usage;
        }

        await using var scope = host.Services.CreateAsyncScope();
        var provider = scope.ServiceProvider;
        var account = await provider.GetRequiredService<IPlayerStore>().FindAccountByEmailAsync(RequestMagicLinkEndpoint.NormalizeEmail(email), cancellationToken);
        if (account is null)
        {
            logger.LogWarning("Aucun compte n'a cette adresse ({Flag})", flag);
            return NotFound;
        }

        if (flag == ExportFlag)
        {
            var export = await provider.GetRequiredService<PlayerDataExporter>().ExportAsync(account.PlayerId, cancellationToken);
            if (export is null)
            {
                logger.LogWarning("Joueur {PlayerId} supprimé, rien à exporter", account.PlayerId);
                return NotFound;
            }

            var writer = output ?? Console.Out;
            await writer.WriteLineAsync(JsonSerializer.Serialize(export, Json).AsMemory(), cancellationToken);
            await writer.FlushAsync(cancellationToken);
            logger.LogInformation("Joueur {PlayerId} exporté : {Modules} mode(s), {Devices} appareil(s)", account.PlayerId, export.Modules.Count, export.Devices.Count);
            return 0;
        }

        var db = provider.GetRequiredService<InSecondsDbContext>();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var erased = await provider.GetRequiredService<AccountErasure>().EraseAsync(account.PlayerId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        PlayersLog.AccountErased(logger, account.PlayerId, "command", erased.Games, erased.Devices);
        return 0;
    }

    private sealed class NoValidationCache : IDeviceSessionValidationCache
    {
        public void Forget(Guid playerId, int deviceSessionId)
        {
        }
    }
}
