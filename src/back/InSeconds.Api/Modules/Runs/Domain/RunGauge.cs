namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Où en est une manche : son score, son objectif et son maximum (morceaux neutralisés retirés), et si tous ses morceaux ont reçu une réponse.</summary>
/// <param name="Round">La manche, à partir de 1.</param>
/// <param name="Complete">Tous les morceaux de la manche ont une réponse (neutralisés compris) : elle est jouée.</param>
/// <param name="MaxScore">Ce que rapportent au plus ses morceaux non neutralisés, à la difficulté de la manche (son plafond).</param>
/// <param name="Difficulty">La difficulté de la manche (choisie, ou « Sûre » sans choix).</param>
public sealed record RoundProgress(int Round, int Score, int Objective, int MaxScore, bool Complete, RunDifficulty Difficulty)
{
    /// <summary>L'objectif est atteint (<c>&gt;=</c>). Une manche entièrement neutralisée (objectif 0) est passée.</summary>
    public bool Reached => Score >= Objective;
}

/// <summary>
/// La jauge d'une manche : l'objectif est le pourcentage de la difficulté de la manche (figé dans les règles du défi) appliqué au **maximum de la
/// manche sans facteur de difficulté**, arrondi au plus proche (45 % de 500 = 225 ; 55 % de 665 = 366). Un morceau neutralisé sort du maximum :
/// l'objectif se recalcule sur les morceaux restants. Le plafond est ce même maximum au facteur de points de la difficulté.
/// </summary>
public static class RunGauge
{
    public static int Objective(int objectivePercent, int baseMaxScore) =>
        (int)decimal.Round(objectivePercent * (decimal)baseMaxScore / 100m, 0, MidpointRounding.AwayFromZero);

    /// <summary>La manche <paramref name="round"/> de cette partie, à cette difficulté, d'après ses réponses et les morceaux du défi.</summary>
    /// <param name="loweredPercent">La baisse de l'objectif en pourcentage (« Seuil abaissé »), 0 sans carte.</param>
    public static RoundProgress Of(
        RunChallenge challenge, IReadOnlyCollection<RunAnswer> answers, int round, IRunScoringPolicy scoring, RunDifficultyOption option,
        int loweredPercent = 0)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        ArgumentNullException.ThrowIfNull(answers);
        ArgumentNullException.ThrowIfNull(scoring);
        ArgumentNullException.ThrowIfNull(option);

        var byPosition = answers.ToDictionary(a => (int)a.Position);
        var tracks = challenge.Tracks.Where(t => t.Round == round).ToList();
        var score = 0;
        var baseMax = 0;
        var max = 0;
        foreach (var track in tracks)
        {
            var answer = byPosition.GetValueOrDefault(track.Position);
            if (answer is { Neutralized: true })
                continue;
            baseMax += scoring.MaxPoints(track.Multiplier);
            max += scoring.MaxPoints(option.Scale(track.Multiplier));
            score += answer?.Points ?? 0;
        }

        var objective = Objective(option.ObjectivePercent, baseMax);
        if (loweredPercent > 0)
            objective = (int)decimal.Round(objective * (100m - loweredPercent) / 100m, 0, MidpointRounding.AwayFromZero);
        return new RoundProgress(
            round, score, objective, max, tracks.All(t => byPosition.ContainsKey(t.Position)), option.Difficulty);
    }
}
