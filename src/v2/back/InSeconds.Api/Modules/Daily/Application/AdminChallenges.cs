using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
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

public sealed record AdminChallengeStatsResponse(IReadOnlyList<AdminChallengeStats> Challenges);

public static class GetChallengeStatsEndpoint
{
    /// <summary>Les défis montrés par « Stats par défi » (v1 : les 30 derniers).</summary>
    public const int Count = 30;

    /// <summary>
    /// <c>GET /api/admin/daily/challenges/stats</c> (v1 : <c>GET /api/admin/challenge-stats</c>) : les 30 derniers défis. **Un jour terminé pour de
    /// bon (J-2 et avant) est lu dans sa photo figée** (E3), la veille et le jour même sont calculés en direct (une partie peut encore s'y
    /// finir, piège 18) par la même règle. **Le pseudo et le titre ne sont jamais figés** : ils sont joints ici, un renommage ou un changement de
    /// pseudo se voit donc sans recalcul ; le pseudo d'un joueur supprimé après la photo n'est plus montré (limite de E3), il reste compté
    /// jusqu'au prochain recalcul.
    /// </summary>
    [WolverineGet("/api/admin/daily/challenges/stats", OperationId = "getChallengeStats")]
    public static async Task<AdminChallengeStatsResponse> Get(
        IDailyStatsQueries stats, ITrackDirectory tracks, IPlayerDirectory players, DailyRules rules, IGameCalendar calendar, CancellationToken ct)
    {
        var today = calendar.Today;
        var lastClosable = CloseChallengeDayHandler.LastClosableDay(calendar);
        var recent = await stats.ListRecentChallengesAsync(Count, ct);

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
        return new AdminChallengeStatsResponse(response);
    }

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
    /// <c>GET /api/admin/daily/challenges</c> (v1 : <c>GET /api/admin/challenges</c>) : l'historique des défis, du plus récent au plus ancien, avec
    /// leurs morceaux (artiste, titre affiché, identifiant Deezer). Tous les défis, comme en v1 : le front les groupe par mois.
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
