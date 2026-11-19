namespace InSeconds.Api.Modules.Social.Contracts;

/// <summary>Les périodes du classement d'un groupe par score : le jour de jeu en cours et les sept derniers jours glissants.</summary>
public static class ScorePeriods
{
    /// <summary>La semaine : le jour en cours et les six jours d'avant (dates des défis, jamais l'heure de fin d'une partie).</summary>
    public const int WeekDays = 7;
}

/// <summary>Ce qu'un membre a marqué dans un mode, par période.</summary>
/// <param name="PlayedToday">Il a fini la partie du jour (qui a joué n'est pas un secret, son score si).</param>
/// <param name="TodayScore">Son score du jour, vide s'il n'a pas fini, ou si le joueur qui regarde n'a pas encore le droit de le voir.</param>
/// <param name="WeekPoints">La somme de ses scores sur la semaine (un jour manqué vaut 0).</param>
/// <param name="WeekPlayedDays">
/// Les jours de la semaine (dates des défis) où il a fini une partie, au plus <see cref="ScorePeriods.WeekDays"/>, sans ceux que le joueur qui
/// regarde ne doit pas encore voir (les mêmes que pour les points).
/// </param>
public sealed record MemberPeriodScores(bool PlayedToday, int? TodayScore, int WeekPoints, IReadOnlyList<DateOnly> WeekPlayedDays);

/// <summary>Les scores d'un mode pour un groupe, tels que le joueur qui regarde a le droit de les voir.</summary>
/// <param name="Day">Le jour de jeu en cours (jour UTC).</param>
/// <param name="TodayRevealed">
/// Le joueur qui regarde a fini sa partie du jour : les scores du jour des autres lui sont montrés. Tant que non, aucun score du jour n'est rendu,
/// ni seul ni dans la semaine. **La semaine est entièrement à la charge du mode** : il en retire tout jour que ce joueur peut encore jouer (pour
/// Daily, le jour en cours tant qu'il n'est pas fini, et la veille tant que sa partie de la veille est en cours) ; Social ne peut pas le faire.
/// </param>
/// <param name="Members">Les membres qui ont fini au moins une partie sur la semaine ; un membre absent n'a rien marqué.</param>
public sealed record ModeScores(DateOnly Day, bool TodayRevealed, IReadOnlyDictionary<Guid, MemberPeriodScores> Members);

/// <summary>
/// Ce qu'un mode de jeu donne au classement par score d'un groupe (jour et semaine), sur le principe de <see cref="IMemberPerformanceSource"/> :
/// chaque mode qui a un score par jour **ajoute** son implémentation au conteneur (<c>services.AddScoped&lt;IMemberScoreSource, …&gt;()</c>), Social
/// les interroge toutes sans connaître aucun mode et fait **un classement par mode**, jamais une moyenne des modes. Le mode décide de ce que le joueur
/// qui regarde a le droit de voir (<see cref="ModeScores.TodayRevealed"/>).
/// </summary>
public interface IMemberScoreSource
{
    /// <summary>Le nom du mode (<c>daily</c>), en minuscules ; le front le traduit.</summary>
    string Source { get; }

    /// <summary>
    /// Les scores de ces joueurs dans ce mode, vus par <paramref name="viewerId"/> (un membre du groupe). Jamais un pseudo : Social les lit par le
    /// contrat de Players.
    /// </summary>
    Task<ModeScores> GetAsync(Guid viewerId, IReadOnlyCollection<Guid> playerIds, CancellationToken ct);
}
