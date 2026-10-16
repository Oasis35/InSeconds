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

/// <summary>Les réglages publics du défi du jour, lus à chaud (v1 : <c>GET /api/settings</c>).</summary>
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
/// Le défi du jour pour le navigateur courant : lecture seule, ne crée ni joueur, ni cookie, ni partie, et ne génère rien (§ 5.6 du plan v2).
/// </summary>
/// <param name="State"><c>no_challenge</c> · <c>can_start</c> · <c>resumable</c> · <c>already_played</c> · <c>abandoned</c>.</param>
/// <param name="TracksCount">Morceaux du défi (0 sans défi).</param>
/// <param name="CompletedCount">Morceaux déjà répondus, quand la partie est à reprendre.</param>
public sealed record TodayResponse(string State, int TracksCount, int CompletedCount, StreakResponse Streak)
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
        ICurrentPlayer current, IDailyQueries queries, IPlayerDirectory players, IGameCalendar calendar, DailyRules rules, CancellationToken ct)
    {
        var today = calendar.Today;
        var row = await queries.GetTodayAsync(today, current.PlayerId, ct);
        var isLinked = current.PlayerId is { } playerId && await players.HasAccountAsync(playerId, ct);
        var streak = row?.Streak is { } s
            ? DailyStreak.Compute(s.CurrentStreak, s.LastPlayedDate, s.Freezes, today, isLinked, rules.Streak)
            : DailyStreak.None(today, isLinked, rules.Streak);
        var streakResponse = StreakResponse.From(streak);

        if (row is null)
            return new TodayResponse(TodayResponse.NoChallenge, 0, 0, streakResponse);

        var state = row.SessionStatus switch
        {
            null => TodayResponse.CanStart,
            SessionStatus.Pending => TodayResponse.Resumable,
            SessionStatus.Completed => TodayResponse.AlreadyPlayed,
            _ => TodayResponse.Abandoned,
        };
        return new TodayResponse(state, row.TracksCount, row.SessionStatus == SessionStatus.Pending ? row.AnswerCount : 0, streakResponse);
    }
}
