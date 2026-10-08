using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Settings;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Daily.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Infrastructure.Hosting;

/// <summary>
/// <c>dotnet InSeconds.Api.dll --freeze-day-stats</c> : fige les statistiques de tous les jours terminés (J-2 et avant) qui n'ont pas
/// encore leur photo, puis s'arrête. Rien d'autre ne démarre (comme <c>--migrate-only</c>).
///
/// À lancer <b>juste après chaque import</b> des données v1 (PR E4) : l'import ne calcule rien, et la tâche <c>daily-close-day</c>
/// attendrait minuit pour figer l'historique. C'est la même règle que la tâche (<see cref="CloseChallengeDayHandler"/>, du plus ancien
/// au plus récent), avec les réglages de la base : à lancer **après** l'import des réglages (les paliers et le barème en vigueur sont
/// ceux qu'elle fige, § 5.4 du plan v2). Rejouable : un jour déjà figé n'est pas refait (un recalcul passe par la route de l'admin).
/// </summary>
public static class FreezeDayStatsCommand
{
    public const string Flag = "--freeze-day-stats";

    public static bool IsRequested(string[] args) => args.Contains(Flag, StringComparer.Ordinal);

    public static async Task<int> RunAsync(string[] args, CancellationToken cancellationToken = default)
    {
        var builder = Host.CreateApplicationBuilder(args.Where(a => a != Flag).ToArray());
        var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection manquante.");

        // La base, les réglages (paliers, barème) et les règles du jeu : le host n'est jamais démarré, aucun service hébergé ne tourne,
        // ni Wolverine ni Hangfire. Les règles se passent d'indices (la photo n'en lit pas).
        builder.AddDatabaseSettings(connectionString);
        builder.Services.AddInSecondsDatabase(connectionString);
        builder.Services.AddGameCalendar();
        builder.Services.AddOptions<DailyOptions>().BindConfiguration(DailyOptions.Section);
        builder.Services.AddScoped<IDailyStore, EfDailyStore>();
        builder.Services.AddScoped<IDailyStatsQueries, EfDailyStatsQueries>();
        builder.Services.AddSingleton<DailyRules>();
        using var host = builder.Build();

        var logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(FreezeDayStatsCommand));
        var calendar = host.Services.GetRequiredService<IGameCalendar>();
        logger.LogInformation("Statistiques des jours terminés (--freeze-day-stats)");

        IReadOnlyList<UnfrozenChallenge> days;
        await using (var scope = host.Services.CreateAsyncScope())
            days = await scope.ServiceProvider.GetRequiredService<IDailyStatsQueries>()
                .ListUnfrozenChallengesAsync(CloseChallengeDayHandler.LastClosableDay(calendar), cancellationToken);

        var closed = 0;
        var failed = 0;
        foreach (var day in days)
        {
            try
            {
                if (await CloseOneAsync(host.Services, day.Date, cancellationToken))
                    closed++;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Comme la tâche : un jour qui échoue n'empêche pas les suivants, mais la commande échoue à la fin.
                failed++;
                DailyLog.CloseDayFailed(logger, ex, day.Date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture));
            }
        }

        logger.LogInformation("{Closed} jour(s) figé(s), {Failed} en échec, arrêt", closed, failed);
        return failed == 0 ? 0 : 1;
    }

    /// <summary>Un jour, dans sa propre portée et sa propre transaction (le verrou du jour en demande une, comme sous Wolverine).</summary>
    private static async Task<bool> CloseOneAsync(IServiceProvider services, DateOnly day, CancellationToken ct)
    {
        await using var scope = services.CreateAsyncScope();
        var provider = scope.ServiceProvider;
        var db = provider.GetRequiredService<InSecondsDbContext>();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var result = await CloseChallengeDayHandler.Handle(
            new CloseChallengeDay(day),
            provider.GetRequiredService<IDailyStore>(), provider.GetRequiredService<IDailyStatsQueries>(), provider.GetRequiredService<DailyRules>(),
            provider.GetRequiredService<IGameCalendar>(), provider.GetRequiredService<ILogger<CloseChallengeDay>>(), ct);

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return result.Outcome == CloseOutcome.Closed;
    }
}
