using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Les points d'un morceau de la Série : ceux du palier de sa manche (<see cref="RunRules.PointsAt"/>) quand artiste et titre sont justes, la moitié
/// quand un seul l'est, rien sinon. Une politique à part pour que la règle se change (ou se teste) sans toucher la partie.
/// </summary>
public interface IRunScoringPolicy
{
    /// <summary>Les points de cette réponse, <paramref name="stepPoints"/> étant ce que vaut un morceau trouvé en entier à ce palier.</summary>
    int Points(RoundOutcome outcome, int stepPoints);
}

/// <summary>Tout, la moitié (arrondie au plus proche, <see cref="MidpointRounding.AwayFromZero"/>) ou rien.</summary>
public sealed class ArtistTitleScoring : IRunScoringPolicy
{
    public int Points(RoundOutcome outcome, int stepPoints)
    {
        ArgumentNullException.ThrowIfNull(outcome);
        return (outcome.ArtistCorrect, outcome.TitleCorrect) switch
        {
            (true, true) => stepPoints,
            (false, false) => 0,
            _ => (int)decimal.Round(stepPoints / 2m, 0, MidpointRounding.AwayFromZero),
        };
    }
}
