namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Où en est une manche : son score, son objectif et son maximum (morceaux neutralisés retirés), et si tous ses morceaux ont reçu une réponse.</summary>
/// <param name="Round">La manche, à partir de 1.</param>
/// <param name="Complete">Tous les morceaux de la manche ont une réponse (neutralisés compris) : elle est jouée.</param>
public sealed record RoundProgress(int Round, int Score, int Objective, int MaxScore, bool Complete)
{
    /// <summary>L'objectif est atteint (<c>&gt;=</c>). Une manche entièrement neutralisée (objectif 0) est passée.</summary>
    public bool Reached => Score >= Objective;
}

/// <summary>
/// La jauge d'une manche : l'objectif est le pourcentage de la manche (figé dans les règles du défi) appliqué au **maximum de la manche**, arrondi au
/// plus proche (40 % de 500 = 200 ; 50 % de 665 = 333). Un morceau neutralisé sort du maximum : l'objectif se recalcule sur les morceaux restants.
/// </summary>
public static class RunGauge
{
    public static int Objective(RunRules rules, int round, int maxScore)
    {
        ArgumentNullException.ThrowIfNull(rules);
        if (round < 1 || round > rules.ThresholdPercents.Count)
            throw new ArgumentOutOfRangeException(nameof(round));
        return (int)decimal.Round(rules.ThresholdPercents[round - 1] * (decimal)maxScore / 100m, 0, MidpointRounding.AwayFromZero);
    }

    /// <summary>La manche <paramref name="round"/> de cette partie, d'après ses réponses et les morceaux du défi.</summary>
    public static RoundProgress Of(RunChallenge challenge, IReadOnlyCollection<RunAnswer> answers, int round, IRunScoringPolicy scoring)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        ArgumentNullException.ThrowIfNull(answers);
        ArgumentNullException.ThrowIfNull(scoring);

        var byPosition = answers.ToDictionary(a => (int)a.Position);
        var tracks = challenge.Tracks.Where(t => t.Round == round).ToList();
        var score = 0;
        var max = 0;
        foreach (var track in tracks)
        {
            var answer = byPosition.GetValueOrDefault(track.Position);
            if (answer is { Neutralized: true })
                continue;
            max += scoring.MaxPoints(track.Multiplier);
            score += answer?.Points ?? 0;
        }

        return new RoundProgress(round, score, Objective(challenge.Rules, round, max), max, tracks.All(t => byPosition.ContainsKey(t.Position)));
    }
}
