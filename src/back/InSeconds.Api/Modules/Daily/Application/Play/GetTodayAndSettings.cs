using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>Un palier d'écoute et ses points.</summary>
public sealed record DurationScoreResponse(decimal Seconds, int Score);

/// <summary>
/// Un niveau d'indice : quand il se débloque, ce qu'il révèle (<c>year</c>, <c>artistMasked</c>, que le front traduit en « Indice année »,
/// « Indice artiste ») et ce qu'il coûte en pourcentage du score.
/// </summary>
public sealed record HintLevelResponse(int Level, decimal UnlockSeconds, string Kind, int PenaltyPercent);

/// <summary>Les réglages publics du défi du jour, lus à chaud.</summary>
public sealed record DailySettingsResponse(
    int GuessTimerSeconds,
    int TracksPerChallenge,
    IReadOnlyList<decimal> AllowedDurationsSeconds,
    IReadOnlyList<DurationScoreResponse> DurationScores,
    IReadOnlyList<HintLevelResponse> Hints,
    int StreakFreezeEveryDays,
    int StreakFreezeMax);

public static class GetDailySettingsEndpoint
{
    /// <summary>
    /// <c>GET /api/daily/settings</c> : public. Les niveaux d'indice viennent des réglages **et** des fournisseurs d'indices : le front n'en
    /// affiche jamais plus que le serveur n'en révèle.
    /// </summary>
    [WolverineGet("/api/daily/settings", OperationId = "getDailySettings")]
    public static DailySettingsResponse Get(DailyRules rules)
    {
        var options = rules.Options;
        return new DailySettingsResponse(
            options.GuessTimerSeconds,
            options.EffectiveTracksPerChallenge,
            rules.AllowedDurations,
            options.EffectiveDurationScores.Select(d => new DurationScoreResponse(d.Seconds, d.Score)).ToList(),
            rules.HintLevels.Select(l => new HintLevelResponse(l.Level, l.UnlockSeconds, l.KindName, l.PenaltyPercent)).ToList(),
            options.StreakFreezeEveryDays,
            options.StreakFreezeMax);
    }
}

/// <summary>
/// Le défi du jour pour le navigateur courant : lecture seule, ne crée ni joueur, ni cookie, ni partie, et ne génère rien.
/// </summary>
/// <param name="State"><c>no_challenge</c> · <c>can_start</c> · <c>resumable</c> · <c>already_played</c> · <c>abandoned</c>.</param>
/// <param name="TracksCount">Morceaux du défi (0 sans défi).</param>
/// <param name="CompletedCount">Morceaux déjà répondus, quand la partie est à reprendre.</param>
/// <param name="CompletedGames">Parties terminées par le joueur, tous jours confondus (panneau de la série d'un compte, bandeau « crée un compte » d'un invité ; 0 sans joueur).</param>
/// <param name="BestScore">Le record du joueur : son meilleur score sur une partie terminée, tous jours confondus, invité compris (vide sans partie terminée).</param>
/// <param name="YesterdayMedian">
/// Le « score à battre » de l'accueil, pour un joueur qui n'a pas encore de record : la médiane des parties terminées d'hier, comme sur la page
/// des réponses d'hier. Vide pour un joueur qui a un record, sans défi hier, ou sous <see cref="ScoreDistribution.MinPlayersForPercent"/> parties terminées.
/// </param>
public sealed record TodayResponse(
    string State, int TracksCount, int CompletedCount, StreakResponse Streak, int CompletedGames, int? BestScore, int? YesterdayMedian)
{
    public const string NoChallenge = "no_challenge";
    public const string CanStart = "can_start";
    public const string Resumable = "resumable";
    public const string AlreadyPlayed = "already_played";
    public const string Abandoned = "abandoned";
}

public static class GetTodayEndpoint
{
    /// <summary>
    /// <c>GET /api/daily/today</c> : public (un visiteur sans cookie voit l'état « à jouer »). Alimente l'écran d'accueil : le front ne démarre une
    /// partie qu'au clic. La série est celle d'**aujourd'hui** (une série cassée ne reste pas affichée tant que le joueur ne rejoue pas).
    /// </summary>
    [WolverineGet("/api/daily/today", OperationId = "getToday")]
    public static async Task<TodayResponse> Get(
        ICurrentPlayer current, IDailyQueries queries, IDailyStatsQueries stats, IPlayerDirectory players, IGameCalendar calendar, DailyRules rules,
        CancellationToken ct)
    {
        var today = calendar.Today;
        var row = await queries.GetTodayAsync(today, current.PlayerId, ct);
        var isLinked = current.PlayerId is { } playerId && await players.HasAccountAsync(playerId, ct);
        var streak = row?.Streak is { } s
            ? DailyStreak.Compute(s.CurrentStreak, s.LastPlayedDate, s.Freezes, today, isLinked, rules.Streak)
            : DailyStreak.None(today, isLinked, rules.Streak);
        var streakResponse = StreakResponse.From(streak);
        // Le panneau de la série d'un compte l'affiche ; pour un invité, il décide du bandeau « crée un compte » (3 premières parties).
        var completedGames = current.PlayerId is { } countedId
            ? (await stats.GetCompletedCountsByPlayerAsync([countedId], ct)).GetValueOrDefault(countedId)
            : 0;

        // L'accueil montre le record du joueur, sinon la médiane d'hier : jamais le meilleur score du jour, qui découragerait.
        int? bestScore = current.PlayerId is { } bestOf && completedGames > 0 ? await stats.GetBestScoreAsync(bestOf, ct) : null;
        var yesterdayMedian = bestScore is null ? await YesterdayMedianAsync(stats, today, ct) : null;

        if (row is null)
            return new TodayResponse(TodayResponse.NoChallenge, 0, 0, streakResponse, completedGames, bestScore, yesterdayMedian);

        var state = row.SessionStatus switch
        {
            null => TodayResponse.CanStart,
            SessionStatus.Pending => TodayResponse.Resumable,
            SessionStatus.Completed => TodayResponse.AlreadyPlayed,
            _ => TodayResponse.Abandoned,
        };
        return new TodayResponse(
            state, row.TracksCount, row.SessionStatus == SessionStatus.Pending ? row.AnswerCount : 0, streakResponse, completedGames, bestScore, yesterdayMedian);
    }

    /// <summary>La médiane d'hier, arrondie comme sur la page des réponses d'hier ; vide sous le seuil de joueurs ou sans défi hier.</summary>
    private static async Task<int?> YesterdayMedianAsync(IDailyStatsQueries stats, DateOnly today, CancellationToken ct)
    {
        if (await stats.FindChallengeIdAsync(today.AddDays(-1), ct) is not { } challengeId)
            return null;
        var scores = await stats.GetCompletedScoresAsync(challengeId, ct);
        return scores.Count >= ScoreDistribution.MinPlayersForPercent && Medians.Decimal(scores) is { } median ? (int)Math.Floor(median) : null;
    }
}
