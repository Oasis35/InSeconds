namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Une partie terminée, réduite à ce que le classement d'un groupe en garde : le joueur, la date du défi et le score.</summary>
public sealed record FinishedGame(Guid PlayerId, DateOnly ChallengeDate, int Score);

/// <summary>La partie du joueur qui regarde sur un défi encore jouable (le jour, la veille), réduite à ce qui décide de ce qu'il voit.</summary>
public sealed record ViewerGame(DateOnly ChallengeDate, SessionStatus Status, int AnsweredCount);

/// <summary>Ce qu'un joueur a marqué au Défi du jour, par période.</summary>
/// <param name="TodayScore">Le score de sa partie du jour, vide s'il ne l'a pas finie ou si le joueur qui regarde ne doit pas encore le voir.</param>
/// <param name="WeekPlayedDays">Les jours de la semaine où il a fini une partie, du plus ancien au plus récent, sans les jours cachés.</param>
public sealed record PlayerPeriodScores(bool PlayedToday, int? TodayScore, int WeekPoints, IReadOnlyList<DateOnly> WeekPlayedDays)
{
    /// <summary>Le nombre de jours de la semaine où il a fini une partie.</summary>
    public int WeekDaysPlayed => WeekPlayedDays.Count;
}

/// <summary>
/// Les scores du Défi du jour pour le classement d'un groupe, calculés à la lecture sur les parties terminées (rien n'est stocké) :
/// <list type="bullet">
/// <item>le jour : le score de la partie **terminée** du défi du jour (une partie abandonnée ou expirée n'a pas de score) ;</item>
/// <item>la semaine : la somme des scores des défis des <c>weekDays</c> derniers jours, jour en cours compris, **sur la date du défi** (piège 18 : la
/// partie de la veille finie après minuit compte pour la veille) ; un jour manqué vaut 0.</item>
/// </list>
/// Un défi que le joueur qui regarde peut encore jouer est **caché** (<see cref="HiddenDays"/>) : aucun score de ce jour n'est rendu, ni seul ni dans
/// la semaine, sinon l'écart avec la veille trahirait le score des autres.
/// </summary>
public static class DailyPeriodScores
{
    /// <summary>Le premier jour de la semaine qui finit <paramref name="today"/>.</summary>
    public static DateOnly WeekStart(DateOnly today, int weekDays) => today.AddDays(-(weekDays - 1));

    /// <summary>
    /// Les jours dont le joueur qui regarde ne doit pas voir les scores : le jour en cours tant qu'il n'a pas fini sa partie (<see cref="TodayReveal"/>),
    /// et la veille tant que sa partie de la veille est **en cours** (elle se finit après minuit, piège 18 ; on ne commence plus la veille après minuit).
    /// </summary>
    public static IReadOnlySet<DateOnly> HiddenDays(DateOnly today, IEnumerable<ViewerGame> viewerGames)
    {
        ArgumentNullException.ThrowIfNull(viewerGames);
        var games = viewerGames.ToList();
        var hidden = new HashSet<DateOnly>();
        var own = games.FirstOrDefault(g => g.ChallengeDate == today);
        if (!TodayReveal.Allows(own?.Status, own?.AnsweredCount ?? 0))
            hidden.Add(today);
        var yesterday = today.AddDays(-1);
        if (games.Any(g => g.ChallengeDate == yesterday && g.Status == SessionStatus.Pending))
            hidden.Add(yesterday);
        return hidden;
    }

    /// <summary>
    /// Les scores de chaque joueur qui a fini au moins une partie de la semaine (les autres n'y sont pas). Les parties hors de la semaine, ou d'un
    /// défi à venir, sont ignorées ; celles d'un jour caché ne comptent ni dans les points ni dans les jours joués (seul « a joué aujourd'hui » reste).
    /// </summary>
    public static IReadOnlyDictionary<Guid, PlayerPeriodScores> Compute(
        IEnumerable<FinishedGame> games, DateOnly today, int weekDays, IReadOnlySet<DateOnly> hiddenDays)
    {
        ArgumentNullException.ThrowIfNull(games);
        ArgumentNullException.ThrowIfNull(hiddenDays);
        ArgumentOutOfRangeException.ThrowIfLessThan(weekDays, 1);
        var start = WeekStart(today, weekDays);
        var result = new Dictionary<Guid, PlayerPeriodScores>();
        foreach (var player in games.Where(g => g.ChallengeDate >= start && g.ChallengeDate <= today).GroupBy(g => g.PlayerId))
        {
            // Une seule partie par joueur et par défi : un doublon (impossible en base) ne compte qu'une fois.
            var byDay = player.GroupBy(g => g.ChallengeDate).ToDictionary(d => d.Key, d => d.Max(g => g.Score));
            var playedToday = byDay.TryGetValue(today, out var todayScore);
            var counted = byDay.Where(d => !hiddenDays.Contains(d.Key)).OrderBy(d => d.Key).ToList();
            result[player.Key] = new PlayerPeriodScores(
                playedToday, playedToday && !hiddenDays.Contains(today) ? todayScore : null, counted.Sum(d => d.Value), [.. counted.Select(d => d.Key)]);
        }

        return result;
    }
}
