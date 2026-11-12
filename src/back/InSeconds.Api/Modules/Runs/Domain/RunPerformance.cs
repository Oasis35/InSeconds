namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// La performance d'un joueur dans le mode Run, de 0 à 1, pour le classement d'un groupe (le contrat <c>Social.Contracts.IMemberPerformanceSource</c>) :
/// la moyenne, sur ses <see cref="RecentGames"/> dernières parties finies (gagnées ou perdues), de la part des manches passées. Une partie à 3 manches
/// passées sur 4 vaut 0,75. Elle monte et descend avec le niveau de jeu récent ; elle ne dépend d'aucun score (un score trouvé avec de l'aide pèse peu).
/// Provisoire : le niveau du proto 4 (PR 4) la remplacera sans changer le contrat.
/// </summary>
public static class RunPerformance
{
    /// <summary>Combien de parties récentes comptent.</summary>
    public const int RecentGames = 5;

    /// <summary>La performance d'une partie : les manches passées sur celles de sa playlist (figées avec elle).</summary>
    public static double OfGame(int roundsPassed, int rounds) => rounds <= 0 ? 0d : Math.Clamp((double)roundsPassed / rounds, 0d, 1d);

    public static double Average(IReadOnlyCollection<double> games) => games.Count == 0 ? 0d : games.Average();
}
