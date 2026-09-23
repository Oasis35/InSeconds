using InSeconds.Api.Domain;

namespace InSeconds.Api.Common.Streak;

/// <summary>
/// État de la série exposé au front (gélule du header, panneau série/gel, accueil, profil).
/// </summary>
/// <param name="Status"><c>active</c> | <c>protected</c> | <c>broken</c>.</param>
/// <param name="Streak">Série effective (0 si <c>broken</c>).</param>
/// <param name="Freezes">Gels en stock (0 pour un invité).</param>
/// <param name="MaxFreezes">Stock maximum (0 pour un invité).</param>
/// <param name="FreezeEveryDays">+1 gel tous les N jours de série (0 pour un invité).</param>
/// <param name="NextFreezeInDays">Jours de série restants avant le prochain gel (null pour un invité).</param>
/// <param name="MissedDays">Jours manqués depuis le dernier défi joué (aujourd'hui exclu).</param>
/// <param name="LostStreak">Série perdue par un invité, au-dessus du seuil d'incitation (sinon null).</param>
/// <param name="LastPlayedDate">Date du dernier défi terminé.</param>
public sealed record StreakDto(
    string Status,
    int Streak,
    int Freezes,
    int MaxFreezes,
    int FreezeEveryDays,
    int? NextFreezeInDays,
    int MissedDays,
    int? LostStreak,
    DateOnly? LastPlayedDate)
{
    public static readonly StreakDto None = new("active", 0, 0, 0, 0, null, 0, null, null);

    public static StreakDto From(StreakView view) => new(
        view.Status switch
        {
            StreakStatus.Protected => "protected",
            StreakStatus.Broken    => "broken",
            _                      => "active",
        },
        view.Streak,
        view.Freezes,
        view.MaxFreezes,
        view.FreezeEveryDays,
        view.NextFreezeInDays,
        view.MissedDays,
        view.LostStreak,
        view.LastPlayedDate);
}
