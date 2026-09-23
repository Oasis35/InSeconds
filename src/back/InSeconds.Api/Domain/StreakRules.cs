namespace InSeconds.Api.Domain;

/// <summary>
/// Règles du gel de série, lues à chaud dans la table Settings
/// (cf. Common/Streak/StreakRulesReader).
/// </summary>
/// <param name="FreezeEveryDays">+1 gel à chaque multiple de ce nombre de jours de série.</param>
/// <param name="FreezeMax">Stock maximum de gels.</param>
/// <param name="LostNudgeMinDays">Série minimale perdue par un invité pour afficher l'incitation à créer un compte.</param>
public sealed record StreakRules(int FreezeEveryDays, int FreezeMax, int LostNudgeMinDays);

public enum StreakStatus
{
    /// <summary>Aucun jour manqué (dernier défi joué hier ou aujourd'hui), ou aucune série.</summary>
    Active,
    /// <summary>Jours manqués couverts par les gels en stock : la série tient.</summary>
    Protected,
    /// <summary>Jours manqués non couverts : la série est perdue.</summary>
    Broken,
}

/// <summary>État de la série vu depuis <c>today</c>, calculé sans requête (cf. <see cref="Player.GetStreakView"/>).</summary>
/// <param name="Streak">Série effective (0 si <see cref="StreakStatus.Broken"/>).</param>
/// <param name="NextFreezeInDays">Jours de série restants avant le prochain gel (null pour un invité).</param>
/// <param name="MissedDays">Jours manqués entre le dernier défi joué et aujourd'hui (aujourd'hui exclu).</param>
/// <param name="LostStreak">Série perdue par un invité, si elle atteint le seuil d'incitation (sinon null).</param>
public sealed record StreakView(
    StreakStatus Status,
    int Streak,
    int Freezes,
    int MaxFreezes,
    int? NextFreezeInDays,
    int MissedDays,
    int? LostStreak,
    DateOnly? LastPlayedDate);

/// <summary>Effet d'une complétion sur les gels.</summary>
public sealed record StreakCompletionResult(int FreezesUsed, bool FreezeEarned);
