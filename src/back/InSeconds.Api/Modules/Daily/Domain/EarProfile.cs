namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>Le score d'une partie terminée et le jour de son défi.</summary>
public sealed record DatedScore(DateOnly Date, int Score);

/// <summary>Les parties terminées de tous les joueurs sur le défi d'un jour : leur nombre et la somme de leurs scores.</summary>
public sealed record DayTotal(DateOnly Date, int Games, long ScoreSum);

/// <summary>
/// Le décompte des réponses (parties qu'on ne peut plus jouer) : leur nombre, les artistes et titres trouvés, et les réponses trouvées (artiste ou
/// titre) par palier d'écoute. Jamais ce qui a été tapé.
/// </summary>
public sealed record AnswerTally(int Total, int ArtistFound, int TitleFound, IReadOnlyDictionary<decimal, int> FoundBySeconds)
{
    public static AnswerTally Empty { get; } = new(0, 0, 0, new Dictionary<decimal, int>());
}

/// <summary>Un point de la courbe du profil : la semaine (ou le mois) qui commence à <c>Start</c>.</summary>
/// <param name="Average">Sa moyenne sur la période du point ; vide s'il n'y a pas joué.</param>
/// <param name="PlayersAverage">La moyenne de tous les joueurs ; vide sous <see cref="EarProfile.MinPlayersGames"/> parties.</param>
public sealed record ProfilePoint(DateOnly Start, int? Average, int? PlayersAverage, int Games);

/// <summary>Une colonne de « Quand tu trouves » : la part des réponses trouvées à ce palier.</summary>
/// <param name="PlayersPercent">La même part pour tous les joueurs ; vide sous <see cref="AnswerSpeedHistory.MinAnswers"/> réponses.</param>
public sealed record ProfileStep(decimal Seconds, int Percent, int? PlayersPercent);

/// <summary>Les périodes du profil d'oreille.</summary>
public static class ProfilePeriods
{
    /// <summary>Les 8 dernières semaines (lundi), un point par semaine.</summary>
    public const string EightWeeks = "8w";

    /// <summary>Les 6 derniers mois, un point par mois.</summary>
    public const string SixMonths = "6m";

    /// <summary>Depuis sa première partie, un point par mois.</summary>
    public const string All = "all";

    public static bool IsKnown(string? period) => period is null or EightWeeks or SixMonths or All;
}

/// <summary>
/// Le profil d'oreille, calcul pur : courbe de ses moyennes à côté de celle des joueurs, part des réponses par palier, tendance. Toujours la date du
/// défi (piège 18). Rien de stocké : tout part de ses parties et des agrégats de tous les joueurs ; aucune comparaison sous les seuils (rien sous 5
/// parties, rien sous 100 réponses).
/// </summary>
public static class EarProfile
{
    /// <summary>Sous ce nombre de parties de tous les joueurs sur un point, pas de moyenne des joueurs.</summary>
    public const int MinPlayersGames = 5;

    /// <summary>Le premier jour de la période (un lundi pour les semaines, un premier du mois sinon).</summary>
    public static DateOnly PeriodStart(string period, DateOnly today, DateOnly? firstGame) => period switch
    {
        ProfilePeriods.SixMonths => FirstOfMonth(today).AddMonths(-5),
        ProfilePeriods.All => FirstOfMonth(firstGame is { } first && first < today ? first : today),
        _ => Monday(today).AddDays(-7 * 7),
    };

    public static DateOnly Monday(DateOnly day) => day.AddDays(-(((int)day.DayOfWeek + 6) % 7));

    public static DateOnly FirstOfMonth(DateOnly day) => new(day.Year, day.Month, 1);

    /// <summary>Les points de la courbe, de <paramref name="start"/> à <paramref name="today"/>, un par semaine ou par mois, même sans partie.</summary>
    public static IReadOnlyList<ProfilePoint> Points(
        string period, DateOnly start, DateOnly today, IReadOnlyCollection<DatedScore> mine, IReadOnlyCollection<DayTotal> players)
    {
        ArgumentNullException.ThrowIfNull(mine);
        ArgumentNullException.ThrowIfNull(players);
        var weekly = period is not (ProfilePeriods.SixMonths or ProfilePeriods.All);
        DateOnly KeyOf(DateOnly d) => weekly ? Monday(d) : FirstOfMonth(d);
        DateOnly Next(DateOnly d) => weekly ? d.AddDays(7) : d.AddMonths(1);

        var myByKey = mine.Where(s => s.Date >= start && s.Date <= today).GroupBy(s => KeyOf(s.Date)).ToDictionary(g => g.Key, g => g.ToList());
        var playersByKey = players.Where(p => p.Date >= start && p.Date <= today).GroupBy(p => KeyOf(p.Date))
            .ToDictionary(g => g.Key, g => (Games: g.Sum(p => p.Games), Sum: g.Sum(p => p.ScoreSum)));

        var points = new List<ProfilePoint>();
        for (var key = KeyOf(start); key <= today; key = Next(key))
        {
            var my = myByKey.GetValueOrDefault(key);
            var all = playersByKey.GetValueOrDefault(key);
            points.Add(new ProfilePoint(
                key,
                my is { Count: > 0 } ? Round(my.Average(s => s.Score)) : null,
                all.Games >= MinPlayersGames ? Round((double)all.Sum / all.Games) : null,
                my?.Count ?? 0));
        }

        return points;
    }

    /// <summary>
    /// L'évolution de sa moyenne : les <paramref name="days"/> derniers jours (aujourd'hui compris) contre les <paramref name="days"/> d'avant, en
    /// pourcentage arrondi ; vide s'il manque des parties d'un côté.
    /// </summary>
    public static int? TrendPercent(IReadOnlyCollection<DatedScore> mine, DateOnly today, int days = 28)
    {
        ArgumentNullException.ThrowIfNull(mine);
        var recentStart = today.AddDays(-(days - 1));
        var previousStart = recentStart.AddDays(-days);
        var recent = mine.Where(s => s.Date >= recentStart && s.Date <= today).Select(s => s.Score).ToList();
        var previous = mine.Where(s => s.Date >= previousStart && s.Date < recentStart).Select(s => s.Score).ToList();
        if (recent.Count == 0 || previous.Count == 0 || previous.Average() <= 0)
            return null;
        return Round((recent.Average() - previous.Average()) * 100.0 / previous.Average());
    }

    /// <summary>« Quand tu trouves » : la part de ses réponses trouvées à chaque palier, et celle des joueurs ; plus la part « rien trouvé ».</summary>
    public static (IReadOnlyList<ProfileStep> Steps, int? NotFoundPercent, int? PlayersNotFoundPercent) Steps(
        IReadOnlyList<decimal> durations, AnswerTally mine, AnswerTally players)
    {
        ArgumentNullException.ThrowIfNull(durations);
        ArgumentNullException.ThrowIfNull(mine);
        ArgumentNullException.ThrowIfNull(players);
        var playersShown = players.Total >= AnswerSpeedHistory.MinAnswers;
        var steps = durations.Select(seconds => new ProfileStep(
            seconds,
            Percent(mine.FoundBySeconds.GetValueOrDefault(seconds), mine.Total) ?? 0,
            playersShown ? Percent(players.FoundBySeconds.GetValueOrDefault(seconds), players.Total) : null)).ToList();
        return (steps,
            Percent(mine.Total - mine.FoundBySeconds.Values.Sum(), mine.Total),
            playersShown ? Percent(players.Total - players.FoundBySeconds.Values.Sum(), players.Total) : null);
    }

    /// <summary>Un pourcentage arrondi ; vide sans aucune réponse.</summary>
    public static int? Percent(int part, int total) => total <= 0 ? null : Round(part * 100.0 / total);

    private static int Round(double value) => (int)Math.Round(value, MidpointRounding.AwayFromZero);
}
