using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>L'état du défi du jour pour un joueur (ou personne), lu sans rien écrire.</summary>
/// <param name="SessionStatus">Vide : le joueur n'a pas de partie sur ce défi.</param>
/// <param name="AnswerCount">Morceaux déjà répondus (0 sans partie).</param>
public sealed record TodayRow(int ChallengeId, int TracksCount, SessionStatus? SessionStatus, int AnswerCount, StreakRow? Streak);

/// <summary>Les colonnes de la série, pour calculer la série effective sans charger l'entité.</summary>
public sealed record StreakRow(int CurrentStreak, DateOnly? LastPlayedDate, int Freezes);

/// <summary>Lectures du module Daily, en projections directes (§ 5.3 du plan v2).</summary>
public interface IDailyQueries
{
    /// <summary>Le défi de ce jour et, si un joueur est donné, sa partie et sa série ; rien s'il n'y a pas de défi.</summary>
    Task<TodayRow?> GetTodayAsync(DateOnly day, Guid? playerId, CancellationToken ct);

    /// <summary>Ce que les autres joueurs ont répondu sur ce morceau du défi (toutes les parties, quel que soit leur état).</summary>
    Task<PriorAnswerStats> GetPriorAnswerStatsAsync(int challengeId, int position, CancellationToken ct);
}
