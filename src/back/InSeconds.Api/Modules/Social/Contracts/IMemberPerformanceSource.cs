namespace InSeconds.Api.Modules.Social.Contracts;

/// <summary>
/// Ce qu'un joueur a fait dans un mode, pour le classement d'un groupe.
/// </summary>
/// <param name="Performance">Sa performance dans ce mode, de 0 (rien de bon) à 1 (le meilleur possible) ; la façon de la calculer est celle du mode.</param>
/// <param name="GamesPlayed">Le nombre de parties finies dans ce mode (au moins 1 : un joueur sans partie n'a pas de performance).</param>
/// <param name="BestScore">Son meilleur score dans ce mode, vide si le mode n'en a pas.</param>
public sealed record MemberPerformance(double Performance, int GamesPlayed, int? BestScore = null);

/// <summary>
/// Ce qu'un mode de jeu donne au classement d'un groupe, sur le principe de <c>IPlayerDataContributor</c> : chaque mode **ajoute** son implémentation au
/// conteneur (<c>services.AddScoped&lt;IMemberPerformanceSource, …&gt;()</c>), Social les interroge toutes sans connaître aucun mode, et ne voit donc
/// jamais Daily ni Runs. Le classement d'un joueur est la moyenne des performances des modes où il a joué : un nouveau mode s'ajoute sans toucher à Social.
/// </summary>
public interface IMemberPerformanceSource
{
    /// <summary>Le nom du mode (<c>runs</c>), en minuscules ; pas montré au joueur.</summary>
    string Source { get; }

    /// <summary>
    /// La performance de chacun de ces joueurs dans ce mode. Un joueur qui n'a pas fini une partie n'y figure pas. Jamais un pseudo : Social les lit
    /// par le contrat de Players.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, MemberPerformance>> GetAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct);
}
