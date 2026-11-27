using System.Globalization;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Settings;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Persistence;
using InSeconds.Api.Modules.Gameplay;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Persistence;

namespace InSeconds.Api.Infrastructure.Hosting;

/// <summary>
/// <c>dotnet InSeconds.Api.dll --purge-daily-before aaaa-mm-jj [--apply]</c> : efface les jours de défi d'avant cette date (strictement : le jour
/// donné est conservé) avec leurs parties, réponses, photos de statistiques et morceaux de défi, puis rejoue chaque série depuis les jours
/// restants (<see cref="DailyPurge"/>). Puis s'arrête : rien d'autre ne démarre (comme <c>--freeze-day-stats</c>).
///
/// **Sans <c>--apply</c>, simulation** : la même transaction compte ce qui partirait et ce que deviendraient les séries, puis s'annule. Aucune
/// donnée n'est modifiée. Avec <c>--apply</c>, une seule transaction sous verrou consultatif ; rejouable (rien à supprimer, séries déjà rejouées).
/// À lancer **après** une sauvegarde archivée (<c>deploy/infra/backup.sh archive</c>) ; mode d'emploi : <c>docs/exploitation/purge-parties.md</c>.
/// Les journaux ne portent que des nombres et la date limite, jamais un joueur.
/// </summary>
public static class PurgeDailyCommand
{
    public const string Flag = "--purge-daily-before";
    public const string ApplyFlag = "--apply";

    public static bool IsRequested(string[] args) => args.Contains(Flag, StringComparer.Ordinal);

    /// <summary>La date limite, <c>--apply</c>, et les arguments restants pour l'hôte (ni le drapeau, ni la date, ni <c>--apply</c>).</summary>
    public static bool TryParseArguments(string[] args, out DateOnly before, out bool apply, out string[] rest)
    {
        before = default;
        apply = args.Contains(ApplyFlag, StringComparer.Ordinal);
        rest = [];
        var index = Array.IndexOf(args, Flag);
        if (index < 0 || index + 1 >= args.Length
            || !DateOnly.TryParseExact(args[index + 1], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out before))
            return false;

        var date = index + 1;
        rest = args.Where((a, i) => i != index && i != date && a != ApplyFlag).ToArray();
        return true;
    }

    public static async Task<int> RunAsync(string[] args, CancellationToken cancellationToken = default)
    {
        if (!TryParseArguments(args, out var before, out var apply, out var rest))
        {
            await Console.Error.WriteLineAsync($"Usage : {Flag} aaaa-mm-jj [{ApplyFlag}]");
            return 64;
        }

        var builder = Host.CreateApplicationBuilder(rest);
        var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection manquante.");

        // Comme --freeze-day-stats : la base, les réglages (barème des gels) et les règles du jeu ; le host n'est jamais démarré.
        builder.AddDatabaseSettings(connectionString);
        builder.Services.AddInSecondsDatabase(connectionString);
        builder.Services.AddGameCalendar();
        builder.Services.AddOptions<DailyOptions>().BindConfiguration(DailyOptions.Section);
        builder.Services.AddScoped<IPlayerDirectory, EfPlayerDirectory>();
        builder.Services.AddScoped<DailyPurge>();
        builder.Services.AddGameplay();
        builder.Services.AddSingleton<DailyRules>();
        using var host = builder.Build();

        var logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(PurgeDailyCommand));
        var calendar = host.Services.GetRequiredService<IGameCalendar>();

        // Un jour qui peut encore se jouer ou se figer n'a pas à être effacé : la date limite reste au plus à J-1, donc le dernier jour effacé est J-2 (piège 18).
        var lastAllowed = CloseChallengeDayHandler.LastClosableDay(calendar).AddDays(1);
        if (before > lastAllowed)
        {
            logger.LogError(
                "Date limite trop récente ({Before}) : la purge s'arrête au plus tard à {LastAllowed}",
                before.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), lastAllowed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
            return 1;
        }

        var rules = host.Services.GetRequiredService<DailyRules>();
        var problems = DailyOptionsChecks.Problems(rules.Options, rules.MaxHintLevel);
        if (problems.Count > 0)
        {
            foreach (var problem in problems)
                logger.LogError("Réglages incohérents, rien n'est purgé : {Problem}", problem);
            return 1;
        }

        await using var scope = host.Services.CreateAsyncScope();
        var report = await scope.ServiceProvider.GetRequiredService<DailyPurge>().RunAsync(before, rules.Streak, apply, cancellationToken);

        logger.LogInformation(
            "{Mode} avant {Before} : {Challenges} défi(s), {Tracks} morceau(x) de défi, {DayStats} photo(s) de stats, {Sessions} partie(s), "
            + "{Answers} réponse(s), {Players} joueur(s) concerné(s) ; séries : {Kept} inchangée(s), {Changed} rejouée(s), {Removed} supprimée(s)",
            apply ? "Purge appliquée" : "Simulation (rien supprimé)", report.Before.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            report.Challenges, report.ChallengeTracks, report.DayStats, report.Sessions, report.Answers, report.Players,
            report.StreaksKept, report.StreaksChanged, report.StreaksRemoved);
        return 0;
    }
}
