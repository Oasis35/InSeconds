namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>
/// Le cooldown des morceaux, **déduit de la taille du pool** (#275) : une part du pool jouable reste bloquée, celle des derniers défis.
/// Un morceau tiré le jour J n'est de nouveau tirable qu'à partir de J + cooldown + 1 (dernier usage &lt; jour − cooldown).
/// Le pool ne bloque donc jamais plus de cette part : le reste est toujours tirable, et un défi se génère tant qu'il reste assez de morceaux.
/// </summary>
public static class TrackCooldown
{
    /// <summary>
    /// Les jours de cooldown : <c>⌊ jouables × part ÷ morceaux par défi ⌋</c>. Avec 800 morceaux, 75 % et 5 morceaux par défi : 120 jours
    /// (600 morceaux bloqués, 200 tirables). 0 pour un tout petit pool : un morceau peut revenir dès le lendemain.
    /// </summary>
    /// <param name="playableCount">Les morceaux jouables (non désactivés, extrait disponible).</param>
    /// <param name="poolPercent">La part du pool en cooldown, en pourcentage.</param>
    /// <param name="tracksPerChallenge">Les morceaux d'un défi.</param>
    public static int Days(int playableCount, int poolPercent, int tracksPerChallenge)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(playableCount);
        ArgumentOutOfRangeException.ThrowIfNegative(poolPercent);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(tracksPerChallenge);
        return (int)((long)playableCount * poolPercent / 100 / tracksPerChallenge);
    }

    /// <summary>Le premier jour où un morceau tiré à cette date peut de nouveau l'être.</summary>
    public static DateOnly UnlockDate(DateOnly lastUsedDate, int cooldownDays) => lastUsedDate.AddDays(cooldownDays + 1);

    /// <summary>Le plus ancien jour dont les morceaux sont encore exclus d'un défi de ce jour.</summary>
    public static DateOnly ExcludedFrom(DateOnly day, int cooldownDays) => day.AddDays(-cooldownDays);
}
