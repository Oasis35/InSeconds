using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Nombre de joueurs dont le score total tombe dans [<c>MinScore</c>, <c>MaxScore</c>].</summary>
public sealed record ScoreBucketResponse(int MinScore, int MaxScore, int Count);

/// <summary>
/// Un morceau du défi, révélé : son nom, son lien Deezer, sa pochette, ce qu'en ont fait les autres, et la réponse du joueur (vide s'il n'a pas de
/// partie terminée). Les chiffres sont ceux des parties **terminées**.
/// </summary>
public sealed record TrackStatResponse(
    int Position,
    string Artist,
    string Title,
    long DeezerTrackId,
    string? CoverUrl,
    double FailureRatePercent,
    double? AverageSecondsWhenCorrect,
    bool? ArtistCorrect,
    bool? TitleCorrect,
    decimal? ListenedSeconds,
    int? Score,
    IReadOnlyList<GuessBucketResponse> GuessTimeDistribution,
    int NotFoundCount);

/// <summary>Les statistiques du jour (v1 : <c>GET /api/stats/today</c>).</summary>
/// <param name="YourScore">Le score du joueur, vide s'il n'a pas de partie terminée aujourd'hui.</param>
/// <param name="MedianScore">Médiane des scores (division entière des deux valeurs centrales, comme la v1).</param>
/// <param name="TotalPlayers">Parties terminées.</param>
/// <param name="CurrentStreak">La série effective du joueur (0 si cassée).</param>
/// <param name="Tracks">**Vide tant que la partie du joueur n'est pas finie** (terminée, abandonnée ou expirée) : sinon cette route publique donnerait les réponses avant de jouer (piège 31).</param>
/// <param name="FreezesUsed">Gels consommés par la partie du jour (« 1 gel a sauvé ta série »).</param>
/// <param name="FreezeMilestone">Compte : gel gagné par la partie du jour. Invité : palier atteint (« Tu aurais gagné un gel ! »).</param>
/// <param name="MinScore">Le plus bas score du jour (vide sans joueur).</param>
/// <param name="MaxScore">Le plus haut score du jour (vide sans joueur).</param>
/// <param name="MaxPossibleScore">Nombre de morceaux × meilleur palier : la borne haute de l'égaliseur.</param>
/// <param name="ScoreDistribution">L'égaliseur : dix tranches de même largeur.</param>
/// <param name="BetterThanPercent">Part des **autres** joueurs battus (vide sans score ou seul).</param>
public sealed record TodayStatsResponse(
    int? YourScore,
    int MedianScore,
    int TotalPlayers,
    int CurrentStreak,
    IReadOnlyList<TrackStatResponse> Tracks,
    int FreezesUsed,
    bool FreezeMilestone,
    int? MinScore,
    int? MaxScore,
    int MaxPossibleScore,
    IReadOnlyList<ScoreBucketResponse> ScoreDistribution,
    int? BetterThanPercent)
{
    /// <summary>Pas de défi aujourd'hui : tout à zéro, comme la v1.</summary>
    public static TodayStatsResponse Empty { get; } = new(null, 0, 0, 0, [], 0, false, null, null, 0, [], null);
}

public static class GetTodayStatsEndpoint
{
    /// <summary>
    /// <c>GET /api/daily/stats/today</c> : public. Les chiffres anonymes (médiane, répartition, nombre de joueurs) le sont ; les **morceaux** ne sont
    /// rendus qu'à un joueur dont la partie du jour est finie. Les joueurs supprimés n'y figurent pas. Toujours calculée en direct : la photo figée
    /// ne vaut que pour les jours terminés.
    /// </summary>
    [WolverineGet("/api/daily/stats/today", OperationId = "getTodayStats")]
    public static async Task<TodayStatsResponse> Get(
        ICurrentPlayer current,
        IDailyQueries daily,
        IDailyStatsQueries stats,
        ITrackDirectory directory,
        IPlayerDirectory players,
        IGameCalendar calendar,
        DailyRules rules,
        CancellationToken ct)
    {
        var today = calendar.Today;
        var playerId = current.PlayerId;
        var row = await daily.GetTodayAsync(today, playerId, ct);
        if (row is null)
            return TodayStatsResponse.Empty;

        // Les morceaux du jour (nom, lien, pochette) : réservés à un joueur dont la partie est finie.
        var revealTracks = row.SessionStatus is { } status && status != SessionStatus.Pending;
        var own = playerId is { } id && row.SessionStatus == SessionStatus.Completed ? await stats.GetPlayerSessionAsync(row.ChallengeId, id, ct) : null;

        var isLinked = playerId is { } pid && await players.HasAccountAsync(pid, ct);
        var streak = row.Streak is { } s
            ? DailyStreak.Compute(s.CurrentStreak, s.LastPlayedDate, s.Freezes, today, isLinked, rules.Streak)
            : DailyStreak.None(today, isLinked, rules.Streak);

        var sessions = await stats.GetSessionsAsync(row.ChallengeId, ct);
        var scores = sessions.Where(x => x.Status == SessionStatus.Completed).Select(x => x.TotalScore).ToList();
        var tracks = await stats.GetChallengeTracksAsync(row.ChallengeId, ct);
        var aggregates = revealTracks ? await stats.GetTrackAggregatesAsync(row.ChallengeId, completedOnly: true, ct) : null;

        var best = rules.Options.EffectiveDurationScores.Max(d => d.Score);
        var maxPossible = tracks.Count * best;
        var yourScore = own?.TotalScore;

        return new TodayStatsResponse(
            yourScore,
            Medians.Integer(scores),
            scores.Count,
            streak.Streak,
            revealTracks ? await RevealAsync(tracks, aggregates!, own, directory, rules, ct) : [],
            own?.FreezesUsed ?? 0,
            own is not null && FreezeMilestone(own, row.Streak, isLinked, today, rules.Streak),
            scores.Count == 0 ? null : scores.Min(),
            scores.Count == 0 ? null : scores.Max(),
            maxPossible,
            ScoreDistribution.Build(scores, maxPossible).Select(b => new ScoreBucketResponse(b.MinScore, b.MaxScore, b.Count)).ToList(),
            ScoreDistribution.BetterThanPercent(scores, yourScore));
    }

    // Compte : le gel que la partie du jour a réellement gagné. Invité : il n'a jamais de stock, on lui dit seulement qu'il aurait atteint le palier.
    private static bool FreezeMilestone(PlayerSessionRow own, StreakRow? streak, bool isLinked, DateOnly today, StreakRules rules) =>
        isLinked
            ? own.FreezeEarned
            : streak is { } s && rules.FreezeEveryDays > 0 && s.LastPlayedDate == today && s.CurrentStreak > 0 && s.CurrentStreak % rules.FreezeEveryDays == 0;

    private static async Task<IReadOnlyList<TrackStatResponse>> RevealAsync(
        IReadOnlyList<ChallengeTrackRef> tracks,
        IReadOnlyDictionary<int, TrackAggregate> aggregates,
        PlayerSessionRow? own,
        ITrackDirectory directory,
        DailyRules rules,
        CancellationToken ct)
    {
        var infos = await directory.GetAsync(tracks.Select(t => t.TrackId).ToList(), ct);
        var ownAnswers = own?.Answers.ToDictionary(a => a.Position);
        return tracks.OrderBy(t => t.Position).Select(t =>
        {
            var info = infos[t.TrackId];
            var a = aggregates.GetValueOrDefault(t.Position) ?? TrackAggregate.Empty(t.Position);
            var mine = ownAnswers?.GetValueOrDefault(t.Position);
            var distribution = rules.AllowedDurations
                .Select(d => new GuessBucketResponse(d, a.FoundByDuration.GetValueOrDefault(d)))
                .ToList();
            return new TrackStatResponse(
                t.Position, info.Artist, info.DisplayTitle, info.DeezerTrackId, info.CoverUrl,
                a.Total == 0 ? 0 : Math.Round((1.0 - (double)a.Found / a.Total) * 100, 1),
                a.Found == 0 ? null : Math.Round((double)(a.FoundListenedSum / a.Found), 1),
                mine?.ArtistCorrect, mine?.TitleCorrect, mine?.ListenedSeconds, mine?.Score,
                distribution, a.NotFound);
        }).ToList();
    }
}
