namespace InSeconds.Api.Modules.Gameplay.Contracts;

/// <summary>Décide si la réponse d'un joueur correspond au nom de référence (§ 5.3 du plan v2).</summary>
public interface IAnswerMatcher
{
    /// <summary>Vrai si <paramref name="given"/> (vide ou <c>null</c> : faux) désigne <paramref name="expected"/>.</summary>
    bool IsMatch(string? given, string expected);
}

/// <summary>
/// Tirage déterministe (§ 5.3 du plan v2) : le même <paramref name="seed"/> sur la même liste donne toujours le
/// même ordre. Le défi du jour s'en sert (graine = numéro du jour) pour que tout le monde joue les mêmes
/// morceaux, que le défi soit généré à minuit, à la volée ou par l'admin.
/// </summary>
public interface ISeededShuffle
{
    /// <summary>Une nouvelle liste dans un ordre mélangé ; <paramref name="items"/> n'est pas modifiée.</summary>
    IReadOnlyList<T> Shuffle<T>(IEnumerable<T> items, int seed);
}

/// <summary>
/// Les durées d'écoute qui débloquent les indices, propres à chaque mode : le niveau <c>n</c> se débloque
/// quand la durée écoutée atteint <c>UnlockSeconds[n - 1]</c>. Daily la lit de ses réglages (5 s et 10 s).
/// </summary>
public sealed record HintPolicy
{
    private readonly decimal[] _unlockSeconds;

    /// <param name="unlockSeconds">Strictement positives et croissantes : un niveau plus haut se débloque plus tard.</param>
    public HintPolicy(IEnumerable<decimal> unlockSeconds)
    {
        ArgumentNullException.ThrowIfNull(unlockSeconds);
        _unlockSeconds = unlockSeconds.ToArray();
        for (var i = 0; i < _unlockSeconds.Length; i++)
        {
            if (_unlockSeconds[i] <= 0 || (i > 0 && _unlockSeconds[i] <= _unlockSeconds[i - 1]))
                throw new ArgumentException("Les seuils d'indice doivent être positifs et strictement croissants.", nameof(unlockSeconds));
        }
    }

    /// <summary>Un mode sans indice.</summary>
    public static HintPolicy None { get; } = new([]);

    public int LevelCount => _unlockSeconds.Length;

    /// <summary>Les seuils, en lecture seule : le tableau interne n'est jamais exposé.</summary>
    public IReadOnlyList<decimal> UnlockSeconds => Array.AsReadOnly(_unlockSeconds);

    /// <summary>Le mode propose ce niveau (de 1 à <see cref="LevelCount"/>).</summary>
    public bool Proposes(int level) => level >= 1 && level <= _unlockSeconds.Length;

    public decimal UnlockSecondsOf(int level) =>
        Proposes(level) ? _unlockSeconds[level - 1] : throw new ArgumentOutOfRangeException(nameof(level));

    // Un record compare ses champs : sans cela, deux politiques de mêmes seuils seraient différentes (tableaux comparés par référence).
    public bool Equals(HintPolicy? other) => other is not null && _unlockSeconds.SequenceEqual(other._unlockSeconds);

    public override int GetHashCode() => _unlockSeconds.Aggregate(0, (hash, seconds) => HashCode.Combine(hash, seconds));
}

/// <summary>Ce que révèle un indice.</summary>
public enum HintKind
{
    /// <summary>L'année de sortie.</summary>
    Year,

    /// <summary>Le nom de l'artiste masqué « façon pendu » (première lettre de chaque mot).</summary>
    ArtistMasked,
}

/// <summary>Ce qu'un indice a besoin de savoir du morceau (nom de référence, année de sortie si connue).</summary>
public sealed record HintSubject(string Artist, string Title, short? ReleaseYear);

/// <summary>Un élément révélé. <paramref name="Value"/> est <c>null</c> quand la donnée est inconnue (année absente).</summary>
public sealed record HintFact(HintKind Kind, string? Value);

/// <summary>
/// Ce que révèle un niveau d'indice (§ 5.3 du plan v2). Un nouvel indice (décennie, genre) s'ajoute par une
/// nouvelle implémentation, sans toucher à <see cref="TrackRound"/>.
/// </summary>
public interface IHintProvider
{
    /// <summary>Le niveau d'indice auquel cet élément est révélé.</summary>
    int Level { get; }

    HintFact Reveal(HintSubject subject);
}

public static class HintFacts
{
    /// <summary>
    /// Tout ce qui est révélé jusqu'à ce niveau, **cumulatif** : demander directement le niveau 2 rend aussi
    /// ce que le niveau 1 révèle, que le joueur l'ait demandé avant ou non. Dans l'ordre des niveaux.
    /// </summary>
    public static IReadOnlyList<HintFact> UpTo(int level, IEnumerable<IHintProvider> providers, HintSubject subject)
    {
        ArgumentNullException.ThrowIfNull(providers);
        ArgumentNullException.ThrowIfNull(subject);
        return providers.Where(p => p.Level <= level).OrderBy(p => p.Level).Select(p => p.Reveal(subject)).ToList();
    }
}
