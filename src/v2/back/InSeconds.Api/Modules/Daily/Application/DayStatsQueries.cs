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

    /// <summary>Les réponses du défi agrégées par morceau, par position ; seulement celles des parties terminées si <paramref name="completedOnly"/>.</summary>
    Task<IReadOnlyDictionary<int, TrackAggregate>> GetTrackAggregatesAsync(int challengeId, bool completedOnly, CancellationToken ct);

    /// <summary>Les défis du jour <paramref name="upTo"/> et avant dont la photo n'est pas figée, du plus ancien au plus récent.</summary>
    Task<IReadOnlyList<UnfrozenChallenge>> ListUnfrozenChallengesAsync(DateOnly upTo, CancellationToken ct);

    /// <summary>Les réponses des défis de cette période (bornes comprises), par morceau (le morceau, pas sa position dans le défi : il peut revenir).</summary>
    Task<IReadOnlyList<TrackTally>> GetTrackTalliesAsync(DateOnly from, DateOnly to, CancellationToken ct);
}
