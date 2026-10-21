namespace InSeconds.Api.Modules.Players.Contracts;

/// <summary>
/// Ce qu'un mode de jeu (Daily, plus tard Runs) garde d'un joueur, pour ses droits (RGPD) : la copie de ses données (accès, portabilité) et leur
/// effacement. Chaque mode **ajoute** son implémentation au conteneur (<c>services.AddScoped&lt;IPlayerDataContributor, …&gt;()</c>) ; Players les
/// appelle toutes, dans sa propre transaction : la suppression du joueur suit celle de ses données de jeu, qui le référencent. Players ne connaît
/// donc aucun mode (le sens est celui des autres contrats : le mode dépend de Players, jamais l'inverse).
/// </summary>
public interface IPlayerDataContributor
{
    /// <summary>
    /// Le nom de la section du mode dans l'export (<c>daily</c>, <c>runs</c>), en minuscules : **unique** parmi les modes, sans quoi l'export
    /// refuse de se faire. Il fait partie du format que le joueur télécharge : ne jamais le renommer.
    /// </summary>
    string Module { get; }

    /// <summary>
    /// Ses données dans ce mode, telles qu'elles figureront (en JSON) dans la section du mode ; une section vide (rien de joué) reste une section,
    /// jamais <c>null</c>.
    /// </summary>
    Task<object> ExportAsync(Guid playerId, CancellationToken ct);

    /// <summary>Supprime ses données dans ce mode, tout de suite, dans la transaction de l'appelant ; rend le nombre de parties supprimées.</summary>
    Task<int> DeleteAsync(Guid playerId, CancellationToken ct);
}
