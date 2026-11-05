using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Les points d'un morceau de run, à un multiplicateur **effectif** : celui de la manche du morceau, mis à l'échelle par la partie (facteur de la
/// difficulté choisie, puis les coups de pouce). Ce ne sont pas des décorateurs enregistrés dans le conteneur (la politique est unique pour toutes
/// les parties) : la partie passe à chaque appel ce qui s'applique à ce morceau. La jauge en lit le maximum d'un morceau.
/// </summary>
public interface IRunScoringPolicy
{
    /// <summary>Les points de cette réponse, au multiplicateur effectif du morceau.</summary>
    int Points(RoundOutcome outcome, decimal multiplier);

    /// <summary>Ce qu'un morceau rapporte au plus, à ce multiplicateur.</summary>
    int MaxPoints(decimal multiplier);
}

/// <summary>
/// (50 si l'artiste est juste + 50 si le titre est juste) × multiplicateur, **arrondi au plus proche sur le total du morceau**
/// (<see cref="MidpointRounding.AwayFromZero"/>) : un morceau trouvé en manche 2 (×1,33) vaut 133, à moitié trouvé 67.
/// </summary>
public sealed class ArtistTitleScoring : IRunScoringPolicy
{
    public const int ArtistPoints = 50;
    public const int TitlePoints = 50;

    public int Points(RoundOutcome outcome, decimal multiplier)
    {
        ArgumentNullException.ThrowIfNull(outcome);
        return Round(((outcome.ArtistCorrect ? ArtistPoints : 0) + (outcome.TitleCorrect ? TitlePoints : 0)) * multiplier);
    }

    public int MaxPoints(decimal multiplier) => Round((ArtistPoints + TitlePoints) * multiplier);

    private static int Round(decimal points) => (int)decimal.Round(points, 0, MidpointRounding.AwayFromZero);
}
