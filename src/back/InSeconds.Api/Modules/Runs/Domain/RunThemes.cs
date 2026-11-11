namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>
/// Les thèmes des manches d'une playlist : ceux de la liste que l'admin tient dans Catalogue (« Années 80 », « Films »…), associés aux morceaux, à part
/// des genres. Une manche à thème (jamais la première) tire ses morceaux dans un thème, tiré au hasard à la création de la playlist.
/// </summary>
public static class RunThemes
{
    /// <summary>
    /// Le moins de thèmes assez fournis pour proposer un choix : deux à choisir et au moins un autre pour le thème mystère. En dessous, la playlist n'a
    /// pas de manche à thème (un choix entre un seul thème et « mystère » qui le désignerait aussi serait ridicule).
    /// </summary>
    public const int MinEligibleThemes = 3;

    /// <summary>Le morceau est dans le thème : tout morceau sans thème demandé, seulement ceux qui l'ont (parmi leurs thèmes) sinon.</summary>
    public static bool Matches(int? themeId, IReadOnlyList<int>? trackThemeIds) => themeId is null || trackThemeIds?.Contains(themeId.Value) == true;

    /// <summary>Les thèmes qui ont assez de morceaux pour une manche : ceux à jouer et ceux de la réserve de l'Échange (5 et 2 par défaut).</summary>
    public static IReadOnlyList<int> Eligible(IEnumerable<IReadOnlyList<int>?> trackThemeIds, RunRules rules)
    {
        ArgumentNullException.ThrowIfNull(trackThemeIds);
        ArgumentNullException.ThrowIfNull(rules);
        var needed = rules.TracksPerRound + rules.ReservePerRound;
        return trackThemeIds
            .SelectMany(ids => ids ?? [])
            .GroupBy(id => id).Where(g => g.Count() >= needed)
            .Select(g => g.Key).Order().ToList();
    }
}
