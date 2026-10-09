using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>La partie d'un joueur sur un défi, avec ses réponses (celles qu'il voit en fin de partie).</summary>
public sealed record PlayerSessionRow(SessionStatus Status, int TotalScore, int FreezesUsed, bool FreezeEarned, IReadOnlyList<PlayerAnswerRow> Answers);

public sealed record PlayerAnswerRow(int Position, bool ArtistCorrect, bool TitleCorrect, decimal ListenedSeconds, int Score);

/// <summary>Ce que les réponses d'un morceau donnent sur une période : le matériau des stories hebdo.</summary>
/// <param name="FullyCorrect">Réponses où l'artiste **et** le titre sont justes.</param>
public sealed record TrackTally(int TrackId, int Answers, int FullyCorrect);

/// <summary>Un défi dont la photo n'est pas encore figée.</summary>
public sealed record UnfrozenChallenge(int ChallengeId, DateOnly Date);

/// <summary>Un défi récent et, s'il est figé, sa photo (contenu JSON et date de calcul).</summary>
public sealed record RecentChallenge(int Id, DateOnly Date, string? SnapshotJson, DateTimeOffset? ComputedAt);

/// <summary>Un défi et ses morceaux, pour l'historique de l'admin.</summary>
public sealed record ChallengeListRow(int Id, DateOnly Date, IReadOnlyList<ChallengeTrackRef> Tracks);

/// <summary>Une partie d'un joueur, pour son historique dans l'admin.</summary>
public sealed record PlayerHistoryRow(DateOnly Date, SessionStatus Status, int TotalScore, int FreezesUsed, bool FreezeEarned);

/// <summary>
/// Lectures des statistiques (§ 5.3 du plan v2), en agrégats. **Les joueurs supprimés en sont toujours exclus** (R8 : Daily ne peut pas naviguer vers
/// Players, l'implémentation joint la table des joueurs en lecture seule).
/// </summary>
public interface IDailyStatsQueries
{
    Task<IReadOnlyList<ChallengeTrackRef>> GetChallengeTracksAsync(int challengeId, CancellationToken ct);

    /// <summary>La partie de ce joueur sur ce défi ; ses réponses seulement si elle est terminée.</summary>
    Task<PlayerSessionRow?> GetPlayerSessionAsync(int challengeId, Guid playerId, CancellationToken ct);

    /// <summary>Les parties du défi, de tous les joueurs non supprimés.</summary>
    Task<IReadOnlyList<DaySessionRow>> GetSessionsAsync(int challengeId, CancellationToken ct);

    /// <summary>Les scores des parties **terminées** du défi (les joueurs non supprimés) : tout ce qu'il faut à `stats/today`, sans une ligne par partie de tout statut.</summary>
    Task<IReadOnlyList<int>> GetCompletedScoresAsync(int challengeId, CancellationToken ct);

    /// <summary>Les réponses du défi agrégées par morceau, par position ; seulement celles des parties terminées si <paramref name="completedOnly"/>.</summary>
    Task<IReadOnlyDictionary<int, TrackAggregate>> GetTrackAggregatesAsync(int challengeId, bool completedOnly, CancellationToken ct);

    /// <summary>Les défis du jour <paramref name="upTo"/> et avant dont la photo n'est pas figée, du plus ancien au plus récent.</summary>
    Task<IReadOnlyList<UnfrozenChallenge>> ListUnfrozenChallengesAsync(DateOnly upTo, CancellationToken ct);

    /// <summary>Les réponses des défis de cette période (bornes comprises), par morceau (le morceau, pas sa position dans le défi : il peut revenir).</summary>
    Task<IReadOnlyList<TrackTally>> GetTrackTalliesAsync(DateOnly from, DateOnly to, CancellationToken ct);

    /// <summary>Les <paramref name="take"/> défis les plus récents, du plus récent au plus ancien, avec leur photo figée s'ils en ont une.</summary>
    Task<IReadOnlyList<RecentChallenge>> ListRecentChallengesAsync(int take, CancellationToken ct);

    /// <summary>Tous les défis avec leurs morceaux, du plus récent au plus ancien (l'historique de l'admin).</summary>
    Task<IReadOnlyList<ChallengeListRow>> ListChallengesAsync(CancellationToken ct);

    /// <summary>Les dates de tous les défis, de la plus récente à la plus ancienne.</summary>
    Task<IReadOnlyList<DateOnly>> ListChallengeDatesAsync(CancellationToken ct);

    /// <summary>L'identifiant du défi de ce jour, vide s'il n'y en a pas.</summary>
    Task<int?> FindChallengeIdAsync(DateOnly day, CancellationToken ct);

    /// <summary>Parties **terminées** par jour de défi, depuis <paramref name="since"/> (les jours sans partie sont absents).</summary>
    Task<IReadOnlyDictionary<DateOnly, int>> GetCompletedCountsByDayAsync(DateOnly since, CancellationToken ct);

    /// <summary>Parties terminées par joueur (tous les joueurs qui en ont au moins une).</summary>
    Task<IReadOnlyDictionary<Guid, int>> GetCompletedCountsByPlayerAsync(CancellationToken ct);

    /// <summary>La série stockée de ces joueurs ; un joueur sans ligne n'a pas de série.</summary>
    Task<IReadOnlyDictionary<Guid, StreakRow>> GetStreaksAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct);

    /// <summary>Les parties de ce joueur sur les défis de ce jour et des suivants, de la plus récente à la plus ancienne.</summary>
    Task<IReadOnlyList<PlayerHistoryRow>> GetPlayerHistoryAsync(Guid playerId, DateOnly since, CancellationToken ct);
}
