namespace InSeconds.Api.Modules.Gameplay.Contracts;

/// <summary>Décide si la réponse d'un joueur correspond au nom de référence.</summary>
public interface IAnswerMatcher
{
    /// <summary>Vrai si <paramref name="given"/> (vide ou <c>null</c> : faux) désigne <paramref name="expected"/>.</summary>
    bool IsMatch(string? given, string expected);
}

/// <summary>
/// Tirage déterministe : le même <paramref name="seed"/> sur la même liste donne toujours le
/// même ordre. Le défi du jour s'en sert (graine = numéro du jour) pour que tout le monde joue les mêmes
/// morceaux, que le défi soit généré à minuit, à la volée ou par l'admin.
/// </summary>
public interface ISeededShuffle
{
    /// <summary>Une nouvelle liste dans un ordre mélangé ; <paramref name="items"/> n'est pas modifiée.</summary>
    IReadOnlyList<T> Shuffle<T>(IEnumerable<T> items, int seed);
}
