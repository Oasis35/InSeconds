using System.Globalization;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Un joueur d'un défi. Le pseudo est vide pour un invité et pour un joueur supprimé depuis (une photo figée le garde jusqu'au recalcul).</summary>
public sealed record AdminChallengePlayer(Guid PlayerId, string Status, int Score, string? Pseudo);

/// <summary>Les chiffres d'un morceau du défi. Le titre est le titre affiché (sans parenthèses ni crochets) : un renommage se voit tout de suite.</summary>
public sealed record AdminChallengeTrackStats(
    int Position, string Artist, string Title, int TotalAnswers, double ArtistCorrectRate, double TitleCorrectRate, double ExtendedRate,
    double? AvgListenedSeconds, IReadOnlyList<DurationBucket> GuessTimeDistribution, int NotFoundCount);

/// <param name="PendingCount">En cours : 0 pour un jour passé, replié sur <paramref name="ExpiredCount"/>.</param>
/// <param name="AbandonedCount">Clic explicite sur « Abandonner ».</param>
/// <param name="ComputedAt">Date du calcul de la photo figée ; vide quand les chiffres sont calculés en direct (la veille et le jour même).</param>
/// <param name="CanRecompute">La photo peut être refaite (J-2 et avant) : le bouton « recalculer » de l'admin.</param>
public sealed record AdminChallengeStats(
    int Id, DateOnly Date, int PlayerCount, int PendingCount, int AbandonedCount, int ExpiredCount, int? ScoreMin, int? ScoreMax, double? ScoreAvg, double? ScoreMedian,
    IReadOnlyList<AdminChallengeTrackStats> Tracks, IReadOnlyList<AdminChallengePlayer> Players, DateTimeOffset? ComputedAt, bool CanRecompute);

/// <param name="Challenges">Les défis du mois demandé, sinon les 30 derniers ; du plus récent au plus ancien.</param>
/// <param name="Months">Tous les mois qui ont un défi (`aaaa-mm`), du plus récent au plus ancien : la navigation de mois de l'admin.</param>
/// <param name="TotalCount">Le nombre de tous les défis.</param>
public sealed record AdminChallengeStatsResponse(IReadOnlyList<AdminChallengeStats> Challenges, IReadOnlyList<string> Months, int TotalCount);

public static class GetChallengeStatsEndpoint
{
    /// <summary>Les défis rendus sans mois demandé : les 30 derniers.</summary>
    public const int Count = 30;

    private const string MonthFormat = "yyyy-MM";

    public static ProblemDetails Validate([FromQuery] string? month) =>
        string.IsNullOrWhiteSpace(month) || TryParseMonth(month, out _)
            ? WolverineContinue.NoProblems
            : ApiProblem.Of(StatusCodes.Status400BadRequest, DailyAdminErrorCodes.InvalidMonth, "Le mois doit être au format aaaa-mm.");

    /// <summary>
    /// <c>GET /api/admin/daily/challenges/stats?month=aaaa-mm</c> : les défis du mois demandé, sinon les 30 derniers, avec la liste de
    /// tous les mois qui ont un défi (l'admin charge un mois quand on y navigue). **Un jour terminé pour de
    /// bon (J-2 et avant) est lu dans sa photo figée**, la veille et le jour même sont calculés en direct (une partie peut encore s'y
    /// finir, piège 18) par la même règle. **Le pseudo et le titre ne sont jamais figés** : ils sont joints ici, un renommage ou un changement de
    /// pseudo se voit donc sans recalcul ; le pseudo d'un joueur supprimé après la photo n'est plus montré (limite connue), il reste compté
    /// jusqu'au prochain recalcul.
    /// </summary>
    [WolverineGet("/api/admin/daily/challenges/stats", OperationId = "getChallengeStats")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public static async Task<AdminChallengeStatsResponse> Get(
        [FromQuery] string? month, IDailyStatsQueries stats, ITrackDirectory tracks, IPlayerDirectory players, DailyRules rules, IGameCalendar calendar,
        CancellationToken ct)
    {
        var today = calendar.Today;
        var lastClosable = CloseChallengeDayHandler.LastClosableDay(calendar);
        var recent = !string.IsNullOrWhiteSpace(month) && TryParseMonth(month, out var first)
            ? await stats.ListChallengesBetweenAsync(first, first.AddMonths(1).AddDays(-1), ct)
            : await stats.ListRecentChallengesAsync(Count, ct);
        var dates = await stats.ListChallengeDatesAsync(ct);

        var snapshots = new List<(DayStatsPayload Payload, DateTimeOffset? ComputedAt)>();
        foreach (var challenge in recent)
        {
            var frozen = challenge.SnapshotJson is null ? null : DayStatsJson.Read(challenge.SnapshotJson);
            if (frozen is not null)
            {
                snapshots.Add((frozen, challenge.ComputedAt));
                continue;
            }

            var live = DayStatsCalculator.Build(
                challenge.Date, challenge.Id, isPast: challenge.Date < today,
                await stats.GetSessionsAsync(challenge.Id, ct),
                await stats.GetChallengeTracksAsync(challenge.Id, ct),
                await stats.GetTrackAggregatesAsync(challenge.Id, completedOnly: false, ct),
                rules.AllowedDurations, rules.Options.EffectiveDurationScores);
            snapshots.Add((live, null));
        }

        var trackInfos = await tracks.GetAsync(snapshots.SelectMany(s => s.Payload.Tracks).Select(t => t.TrackId).Distinct().ToList(), ct);
        var pseudos = await players.GetPseudosAsync(snapshots.SelectMany(s => s.Payload.Players).Select(p => p.PlayerId).Distinct().ToList(), ct);

        var response = snapshots.Select(s => ToResponse(s.Payload, s.ComputedAt, s.Payload.Date <= lastClosable, trackInfos, pseudos)).ToList();
        var months = dates.Select(d => d.ToString(MonthFormat, CultureInfo.InvariantCulture)).Distinct().ToList();
        return new AdminChallengeStatsResponse(response, months, dates.Count);
    }

    private static bool TryParseMonth(string month, out DateOnly first) =>
        DateOnly.TryParseExact(month, MonthFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out first);

    public static AdminChallengeStats ToResponse(
        DayStatsPayload payload, DateTimeOffset? computedAt, bool canRecompute,
        IReadOnlyDictionary<int, TrackInfo> trackInfos, IReadOnlyDictionary<Guid, string> pseudos) =>
        new(
            payload.ChallengeId, payload.Date, payload.PlayerCount, payload.PendingCount, payload.AbandonedCount, payload.ExpiredCount,
            payload.ScoreMin, payload.ScoreMax, payload.ScoreAvg, payload.ScoreMedian,
            payload.Tracks.Select(t => new AdminChallengeTrackStats(
                t.Position,
                trackInfos.TryGetValue(t.TrackId, out var info) ? info.Artist : "",
                trackInfos.TryGetValue(t.TrackId, out info) ? info.DisplayTitle : "",
                t.TotalAnswers, t.ArtistCorrectRate, t.TitleCorrectRate, t.ExtendedRate, t.AvgListenedSeconds, t.GuessTimeDistribution, t.NotFoundCount)).ToList(),
            payload.Players.Select(p => new AdminChallengePlayer(p.PlayerId, p.Status, p.Score, pseudos.GetValueOrDefault(p.PlayerId))).ToList(),
            computedAt, canRecompute);
}

/// <summary>Un morceau d'un défi, tel que l'historique de l'admin le montre.</summary>
public sealed record AdminChallengeTrack(int Position, string Artist, string Title, long DeezerTrackId);

public sealed record AdminChallenge(int Id, DateOnly Date, IReadOnlyList<AdminChallengeTrack> Tracks);

public static class ListChallengesEndpoint
{
    /// <summary>
    /// <c>GET /api/admin/daily/challenges</c> : l'historique des défis, du plus récent au plus ancien, avec
    /// leurs morceaux (artiste, titre affiché, identifiant Deezer). Tous les défis : le front les groupe par mois.
    /// </summary>
    [WolverineGet("/api/admin/daily/challenges", OperationId = "listChallenges")]
    public static async Task<IReadOnlyList<AdminChallenge>> Get(IDailyStatsQueries stats, ITrackDirectory tracks, CancellationToken ct)
    {
        var challenges = await stats.ListChallengesAsync(ct);
        var infos = await tracks.GetAsync(challenges.SelectMany(c => c.Tracks).Select(t => t.TrackId).Distinct().ToList(), ct);

        return challenges.Select(c => new AdminChallenge(
            c.Id, c.Date,
            c.Tracks.Where(t => infos.ContainsKey(t.TrackId)).Select(t => new AdminChallengeTrack(
                t.Position, infos[t.TrackId].Artist, infos[t.TrackId].DisplayTitle, infos[t.TrackId].DeezerTrackId)).ToList())).ToList();
    }
}
