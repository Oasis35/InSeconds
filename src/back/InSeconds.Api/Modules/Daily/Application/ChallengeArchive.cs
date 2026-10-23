using System.Globalization;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Part des joueurs (en %) qui ont trouvé le morceau en écoutant ce palier.</summary>
public sealed record ArchiveGuessStepResponse(decimal DurationSeconds, int Percent);

/// <summary>Part des joueurs (en %) dont le score total tombe dans [<c>MinScore</c>, <c>MaxScore</c>] : la hauteur d'une colonne de l'égaliseur.</summary>
public sealed record ArchiveScoreBucketResponse(int MinScore, int MaxScore, int Percent);

/// <summary>
/// Un morceau d'un jour passé : son nom, sa pochette, son lien Deezer et, à partir de <see cref="ScoreDistribution.MinPlayersForPercent"/> joueurs,
/// ce qu'en ont fait les joueurs. **Que des pourcentages arrondis**, jamais un nombre de joueurs ni de réponses.
/// </summary>
/// <param name="ArtistFoundPercent">Part des réponses où l'artiste est trouvé (vide sous le seuil).</param>
/// <param name="TitleFoundPercent">Part des réponses où le titre est trouvé (vide sous le seuil).</param>
/// <param name="GuessSteps">Part des réponses trouvées à chaque palier d'écoute (vide sous le seuil).</param>
/// <param name="NotFoundPercent">Part des réponses où rien n'est trouvé (vide sous le seuil).</param>
public sealed record ArchiveTrackResponse(
    int Position,
    string Artist,
    string Title,
    int? ReleaseYear,
    long DeezerTrackId,
    string? CoverUrl,
    int? ArtistFoundPercent,
    int? TitleFoundPercent,
    IReadOnlyList<ArchiveGuessStepResponse> GuessSteps,
    int? NotFoundPercent);

/// <summary>Les réponses d'un jour passé, pour tout le monde (aucune donnée d'un joueur).</summary>
/// <param name="PreviousDate">Le défi publié d'avant (vide pour le premier) : la flèche ‹.</param>
/// <param name="NextDate">Le défi publié d'après (vide pour la veille, le dernier publié) : la flèche ›.</param>
/// <param name="HasStats">Au moins <see cref="ScoreDistribution.MinPlayersForPercent"/> parties terminées ; sinon, les morceaux seulement.</param>
/// <param name="MedianScore">Médiane des scores (vide sous le seuil).</param>
/// <param name="MaxPossibleScore">Nombre de morceaux × meilleur palier ce jour-là : la borne haute de l'égaliseur.</param>
/// <param name="ScoreDistribution">L'égaliseur, en pourcentages (vide sous le seuil).</param>
public sealed record ArchiveDayResponse(
    DateOnly Date,
    DateOnly? PreviousDate,
    DateOnly? NextDate,
    bool HasStats,
    int? MedianScore,
    int? MinScore,
    int? MaxScore,
    int MaxPossibleScore,
    IReadOnlyList<ArchiveScoreBucketResponse> ScoreDistribution,
    IReadOnlyList<ArchiveTrackResponse> Tracks);

/// <summary>L'extrait de 30 s d'un morceau d'un jour passé.</summary>
/// <param name="PreviewUrl">Adresse signée et périssable (15 min, piège 14) ; vide si Deezer n'a pas d'extrait, ou n'a pas répondu.</param>
public sealed record ArchivePreviewResponse(string? PreviewUrl);

/// <summary>Les jours publiés, du plus récent (la veille, s'il y a eu un défi) au plus ancien.</summary>
public sealed record ArchiveIndexResponse(IReadOnlyList<DateOnly> Dates);

/// <summary>La réponse du joueur sur un morceau d'un jour passé.</summary>
public sealed record ArchiveMyAnswerResponse(int Position, bool ArtistCorrect, bool TitleCorrect, decimal ListenedSeconds, int Score);

/// <summary>Ce que le joueur de la requête a fait ce jour-là.</summary>
/// <param name="Played">Il a une partie **terminée** ce jour-là ; sinon, rien d'autre n'est rempli.</param>
/// <param name="BetterThanPercent">Part des autres joueurs battus (vide sous le seuil).</param>
public sealed record ArchiveMeResponse(bool Played, int? Score, int? BetterThanPercent, IReadOnlyList<ArchiveMyAnswerResponse> Answers)
{
    public static ArchiveMeResponse None { get; } = new(false, null, null, []);
}

/// <summary>Un jour publié et ses statistiques : la photo figée (J-2 et avant) ou le calcul en direct (la veille).</summary>
public sealed record ArchiveDay(DateOnly Date, int ChallengeId, DayStatsPayload Stats);

/// <summary>
/// Les réponses des jours passés (#407) : publiées **dès le lendemain**, jamais le jour même. La veille est calculée en direct (une partie peut
/// encore s'y finir, piège 18), J-2 et avant sont lus dans la photo figée. Même règle de calcul que l'admin (<see cref="DayStatsCalculator"/>).
/// </summary>
public static class ChallengeArchive
{
    /// <summary>Cache de la veille : ses chiffres bougent encore un peu (une partie peut s'y finir).</summary>
    public const string YesterdayCacheControl = "public, max-age=300";

    /// <summary>Cache d'un jour figé : il ne change plus, sauf recalcul de l'admin.</summary>
    public const string FrozenCacheControl = "public, max-age=86400";

    /// <summary>Le dernier jour publié : la veille.</summary>
    public static DateOnly LastPublishedDay(IGameCalendar calendar) => calendar.Today.AddDays(-1);

    public static bool TryParse(string date, out DateOnly day) =>
        DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day);

    /// <summary>Le jour publié de cette date, vide si la date est mal écrite, sans défi, ou pas encore publiée.</summary>
    public static async Task<ArchiveDay?> FindAsync(string date, IDailyStatsQueries stats, DailyRules rules, IGameCalendar calendar, CancellationToken ct)
    {
        if (!TryParse(date, out var day) || day > LastPublishedDay(calendar))
            return null;
        if (await stats.FindChallengeWithSnapshotAsync(day, ct) is not { } challenge)
            return null;

        var frozen = challenge.SnapshotJson is null ? null : DayStatsJson.Read(challenge.SnapshotJson);
        var payload = frozen ?? DayStatsCalculator.Build(
            challenge.Date, challenge.Id, isPast: true,
            await stats.GetSessionsAsync(challenge.Id, ct),
            await stats.GetChallengeTracksAsync(challenge.Id, ct),
            await stats.GetTrackAggregatesAsync(challenge.Id, completedOnly: false, ct),
            rules.AllowedDurations, rules.Options.EffectiveDurationScores);
        return new ArchiveDay(challenge.Date, challenge.Id, payload);
    }

    public static ProblemDetails NotAvailableIfMissing(ArchiveDay? day) =>
        day is null
            ? ApiProblem.Of(StatusCodes.Status404NotFound, DailyErrorCodes.ArchiveNotAvailable, "Les réponses de ce jour ne sont pas publiées.")
            : WolverineContinue.NoProblems;

    /// <summary>Les dates publiées, de la plus récente à la plus ancienne.</summary>
    public static async Task<IReadOnlyList<DateOnly>> PublishedDatesAsync(IDailyStatsQueries stats, IGameCalendar calendar, CancellationToken ct)
    {
        var last = LastPublishedDay(calendar);
        return (await stats.ListChallengeDatesAsync(ct)).Where(d => d <= last).ToList();
    }

    /// <summary>Les scores des parties terminées de ce jour (les joueurs supprimés depuis la photo n'y sont plus qu'au prochain recalcul).</summary>
    public static IReadOnlyList<int> CompletedScores(DayStatsPayload stats) =>
        stats.Players.Where(p => p.Status == nameof(SessionStatus.Completed)).Select(p => p.Score).ToList();

    /// <summary>Un pourcentage arrondi ; une part non nulle ne tombe jamais à 0 (sa colonne resterait éteinte).</summary>
    public static int Percent(int part, int total) =>
        total <= 0 || part <= 0 ? 0 : Math.Max(1, (int)Math.Round(part * 100.0 / total, MidpointRounding.AwayFromZero));

    public static ArchiveDayResponse ToResponse(ArchiveDay day, IReadOnlyList<DateOnly> published, IReadOnlyDictionary<int, TrackInfo> infos)
    {
        var stats = day.Stats;
        var hasStats = stats.PlayerCount >= ScoreDistribution.MinPlayersForPercent;
        var previous = published.Where(d => d < day.Date).Cast<DateOnly?>().FirstOrDefault();
        var next = published.Where(d => d > day.Date).Cast<DateOnly?>().LastOrDefault();

        var tracks = stats.Tracks.OrderBy(t => t.Position).Where(t => infos.ContainsKey(t.TrackId)).Select(t =>
        {
            var info = infos[t.TrackId];
            return new ArchiveTrackResponse(
                t.Position, info.Artist, info.DisplayTitle, info.ReleaseYear, info.DeezerTrackId, info.CoverUrl,
                hasStats ? RoundRate(t.ArtistCorrectRate) : null,
                hasStats ? RoundRate(t.TitleCorrectRate) : null,
                hasStats ? t.GuessTimeDistribution.Select(b => new ArchiveGuessStepResponse(b.Seconds, Percent(b.Count, t.TotalAnswers))).ToList() : [],
                hasStats ? Percent(t.NotFoundCount, t.TotalAnswers) : null);
        }).ToList();

        return new ArchiveDayResponse(
            day.Date, previous, next, hasStats,
            hasStats && stats.ScoreMedian is { } median ? (int)Math.Floor(median) : null,
            hasStats ? stats.ScoreMin : null,
            hasStats ? stats.ScoreMax : null,
            stats.MaxPossibleScore,
            hasStats ? stats.ScoreDistribution.Select(b => new ArchiveScoreBucketResponse(b.MinScore, b.MaxScore, Percent(b.Count, stats.PlayerCount))).ToList() : [],
            tracks);
    }

    private static int RoundRate(double rate) => (int)Math.Round(rate, MidpointRounding.AwayFromZero);
}

public static class GetArchiveIndexEndpoint
{
    /// <summary>
    /// <c>GET /api/daily/archive</c> : public. Les jours dont les réponses sont publiées (jusqu'à la veille), pour le calendrier de la page d'un
    /// jour et l'icône du pied de page (qui ouvre le plus récent).
    /// </summary>
    [WolverineGet("/api/daily/archive", OperationId = "getArchiveIndex")]
    [EnableRateLimiting(RateLimitPolicies.DailyArchive)]
    public static async Task<ArchiveIndexResponse> Get(IDailyStatsQueries stats, IGameCalendar calendar, HttpResponse response, CancellationToken ct)
    {
        response.Headers.CacheControl = ChallengeArchive.YesterdayCacheControl;
        return new ArchiveIndexResponse(await ChallengeArchive.PublishedDatesAsync(stats, calendar, ct));
    }
}

public static class GetArchiveDayEndpoint
{
    public static Task<ArchiveDay?> LoadAsync(string date, IDailyStatsQueries stats, [NotBody] DailyRules rules, IGameCalendar calendar, CancellationToken ct) =>
        ChallengeArchive.FindAsync(date, stats, rules, calendar, ct);

    public static ProblemDetails Validate(ArchiveDay? day) => ChallengeArchive.NotAvailableIfMissing(day);

    /// <summary>
    /// <c>GET /api/daily/archive/{date}</c> : public et mis en cache (quelques minutes pour la veille, un jour ensuite). Les morceaux du jour et,
    /// à partir de <see cref="ScoreDistribution.MinPlayersForPercent"/> parties terminées, ce qu'en ont fait les joueurs, **en pourcentages
    /// seulement**. Rien d'un joueur : sa partie passe par <c>/me</c>, jamais mise en cache. 404 <c>daily.archive_not_available</c> pour une date
    /// mal écrite, un jour sans défi, et le jour même.
    /// </summary>
    [WolverineGet("/api/daily/archive/{date}", OperationId = "getArchiveDay")]
    [EnableRateLimiting(RateLimitPolicies.DailyArchive)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<ArchiveDayResponse> Get(
        [NotBody] ArchiveDay day, IDailyStatsQueries stats, ITrackDirectory directory, IGameCalendar calendar, HttpResponse response, CancellationToken ct)
    {
        var published = await ChallengeArchive.PublishedDatesAsync(stats, calendar, ct);
        var infos = await directory.GetAsync(day.Stats.Tracks.Select(t => t.TrackId).ToList(), ct);
        response.Headers.CacheControl = day.Date == ChallengeArchive.LastPublishedDay(calendar)
            ? ChallengeArchive.YesterdayCacheControl
            : ChallengeArchive.FrozenCacheControl;
        return ChallengeArchive.ToResponse(day, published, infos);
    }
}

public static class GetMyArchiveDayEndpoint
{
    public static Task<ArchiveDay?> LoadAsync(string date, IDailyStatsQueries stats, [NotBody] DailyRules rules, IGameCalendar calendar, CancellationToken ct) =>
        ChallengeArchive.FindAsync(date, stats, rules, calendar, ct);

    public static ProblemDetails Validate(ArchiveDay? day) => ChallengeArchive.NotAvailableIfMissing(day);

    /// <summary>
    /// <c>GET /api/daily/archive/{date}/me</c> : la partie du navigateur courant ce jour-là (compte ou invité, reconnu par son cookie), jamais mise
    /// en cache (<c>no-store</c>, la règle par défaut de l'API). Lecture seule : ne crée ni joueur ni cookie. Sans cookie, ou sans partie terminée
    /// ce jour-là : <c>played</c> à faux.
    /// </summary>
    [WolverineGet("/api/daily/archive/{date}/me", OperationId = "getMyArchiveDay")]
    [EnableRateLimiting(RateLimitPolicies.DailyArchive)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<ArchiveMeResponse> Get([NotBody] ArchiveDay day, ICurrentPlayer current, IDailyStatsQueries stats, CancellationToken ct)
    {
        if (current.PlayerId is not { } playerId)
            return ArchiveMeResponse.None;
        var own = await stats.GetPlayerSessionAsync(day.ChallengeId, playerId, ct);
        if (own is not { Status: SessionStatus.Completed })
            return ArchiveMeResponse.None;

        return new ArchiveMeResponse(
            true,
            own.TotalScore,
            ScoreDistribution.BetterThanPercent(ChallengeArchive.CompletedScores(day.Stats), own.TotalScore),
            own.Answers.Select(a => new ArchiveMyAnswerResponse(a.Position, a.ArtistCorrect, a.TitleCorrect, a.ListenedSeconds, a.Score)).ToList());
    }
}

public static class GetArchivePreviewEndpoint
{
    /// <summary>Le morceau à cette position du défi de ce jour, vide si le jour n'est pas publié ou n'a pas ce morceau.</summary>
    public static async Task<TrackInfo?> LoadAsync(
        string date, int position, IDailyStatsQueries stats, ITrackDirectory directory, IGameCalendar calendar, CancellationToken ct)
    {
        if (!ChallengeArchive.TryParse(date, out var day) || day > ChallengeArchive.LastPublishedDay(calendar))
            return null;
        if (await stats.FindChallengeIdAsync(day, ct) is not { } challengeId)
            return null;
        if ((await stats.GetChallengeTracksAsync(challengeId, ct)).FirstOrDefault(t => t.Position == position) is not { } track)
            return null;
        return (await directory.GetAsync([track.TrackId], ct)).GetValueOrDefault(track.TrackId);
    }

    public static ProblemDetails Validate(TrackInfo? track) =>
        track is null
            ? ApiProblem.Of(StatusCodes.Status404NotFound, DailyErrorCodes.ArchiveNotAvailable, "Les réponses de ce jour ne sont pas publiées.")
            : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>GET /api/daily/archive/{date}/tracks/{position}/preview</c> : public, l'extrait d'un morceau d'un jour publié, pour le réécouter sur la
    /// page de ce jour. Une adresse neuve à chaque appel (elle expire en 15 min, la page d'un jour reste en cache bien plus longtemps), jamais mise
    /// en cache (<c>no-store</c>), sans créer de joueur. 404 <c>daily.archive_not_available</c> pour un jour pas publié (le jour même compris) ou
    /// une position inconnue.
    /// </summary>
    [WolverineGet("/api/daily/archive/{date}/tracks/{position}/preview", OperationId = "getArchivePreview")]
    [EnableRateLimiting(RateLimitPolicies.DailyArchivePreview)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static async Task<ArchivePreviewResponse> Get([NotBody] TrackInfo track, ITrackPreviews previews, CancellationToken ct) =>
        new((await previews.GetUrlsAsync([track], ct)).GetValueOrDefault(track.Id));
}
