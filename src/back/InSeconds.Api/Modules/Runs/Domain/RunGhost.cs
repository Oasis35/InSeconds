namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Le fantôme d'un ami sur la même playlist : l'auteur de la playlist, quand un autre joueur la joue (jamais le joueur lui-même : pas de fantôme de
/// son propre record, décision du 05/11/2026). On compare ce qui est comparable : le total de l'auteur sur les seuls morceaux que le joueur a
/// vraiment joués (pas un morceau retiré au joueur), jusqu'au dernier qu'il a répondu, jamais d'avance.
/// </summary>
public static class RunGhost
{
    /// <summary>L'auteur sert de fantôme à ce joueur : une playlist lancée par quelqu'un d'autre.</summary>
    public static bool Haunts(Guid? author, Guid player) => author is { } id && id != player;

    /// <summary>
    /// Le total de l'auteur sur ces positions (celles que le joueur a jouées) ; un morceau que l'auteur n'a pas joué (sa partie s'est arrêtée avant)
    /// ne lui rapporte rien.
    /// </summary>
    public static int TotalOver(IReadOnlyDictionary<int, int> authorPoints, IEnumerable<int> playedPositions)
    {
        ArgumentNullException.ThrowIfNull(authorPoints);
        ArgumentNullException.ThrowIfNull(playedPositions);
        return playedPositions.Distinct().Sum(position => authorPoints.GetValueOrDefault(position));
    }

    /// <summary>
    /// Le joueur est allé plus loin que l'auteur : la dernière position que l'auteur a répondue (sa partie s'y est arrêtée) ; vide tant que le joueur
    /// n'a pas dépassé l'auteur.
    /// </summary>
    public static int? StoppedAt(IReadOnlyDictionary<int, int> authorPoints, int reached)
    {
        ArgumentNullException.ThrowIfNull(authorPoints);
        var last = authorPoints.Count == 0 ? 0 : authorPoints.Keys.Max();
        return reached > last ? last : null;
    }
}
