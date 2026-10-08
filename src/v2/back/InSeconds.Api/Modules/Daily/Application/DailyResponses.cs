using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// La série et les gels d'un joueur, vus d'aujourd'hui (gélule de l'en-tête, panneau de série, accueil, toasts).
/// </summary>
/// <param name="Status"><c>active</c> | <c>protected</c> | <c>broken</c>.</param>
/// <param name="Streak">Série effective (0 si <c>broken</c>).</param>
/// <param name="Freezes">Gels en stock, déduction faite de ceux déjà engagés sur les jours manqués d'une série protégée (0 pour un invité).</param>
/// <param name="MaxFreezes">Stock maximum (0 pour un invité).</param>
/// <param name="FreezeEveryDays">+1 gel tous les N jours de série (0 pour un invité).</param>
/// <param name="NextFreezeInDays">Jours de série restants avant le prochain gel (vide pour un invité).</param>
/// <param name="MissedDays">Jours manqués depuis le dernier défi joué (aujourd'hui exclu).</param>
/// <param name="LostStreak">Série perdue par un invité, au-dessus du seuil d'incitation (sinon vide).</param>
/// <param name="LastPlayedDate">Jour du dernier défi terminé.</param>
public sealed record StreakResponse(
    string Status, int Streak, int Freezes, int MaxFreezes, int FreezeEveryDays, int? NextFreezeInDays, int MissedDays, int? LostStreak, DateOnly? LastPlayedDate)
{
    public static StreakResponse From(StreakView view) => new(
        view.Status switch
        {
            StreakStatus.Protected => "protected",
            StreakStatus.Broken => "broken",
            _ => "active",
        },
        view.Streak, view.Freezes, view.MaxFreezes, view.FreezeEveryDays, view.NextFreezeInDays, view.MissedDays, view.LostStreak, view.LastPlayedDate);
}

/// <summary>Un indice révélé : ce qu'il montre (<c>year</c>, <c>artistMasked</c>) et sa valeur (vide si l'année est inconnue).</summary>
public sealed record HintFactResponse(string Kind, string? Value);

/// <summary>Nombre de joueurs qui ont trouvé le morceau en écoutant ce palier.</summary>
public sealed record GuessBucketResponse(decimal DurationSeconds, int Count);
