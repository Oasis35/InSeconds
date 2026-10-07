namespace InSeconds.Api.Modules.Gameplay.Contracts;

/// <summary>
/// Ce qu'une réponse a donné, **sans points** (le calcul appartient au mode, § 5.4 du plan v2) : artiste et
/// titre sont corrigés séparément (le score partiel en dépend), avec le palier d'écoute annoncé et le niveau
/// d'indice révélé au moment de répondre.
/// </summary>
/// <param name="ListenedSeconds">Le palier d'écoute de la réponse (celui que le mode transforme en points).</param>
/// <param name="HintLevelUsed">Le niveau d'indice le plus haut révélé sur ce morceau (0 : aucun).</param>
public sealed record RoundOutcome(bool ArtistCorrect, bool TitleCorrect, decimal ListenedSeconds, int HintLevelUsed)
{
    /// <summary>Artiste et titre trouvés : le score complet.</summary>
    public bool FoundBoth => ArtistCorrect && TitleCorrect;

    /// <summary>Au moins l'un des deux trouvé : le morceau compte comme trouvé dans les statistiques.</summary>
    public bool FoundAny => ArtistCorrect || TitleCorrect;
}

/// <summary>Les noms de référence d'un morceau, ceux de <c>Track</c> : la bonne réponse (parenthèses comprises).</summary>
public sealed record TrackNames(string Artist, string Title);
