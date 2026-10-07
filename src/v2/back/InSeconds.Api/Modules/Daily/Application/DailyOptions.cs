namespace InSeconds.Api.Modules.Daily.Application;

/// <summary>
/// Réglages du module, relus à chaud depuis <c>infra.settings</c> (§ 4.6 du plan v2). E1 n'en lit que deux ; les
/// autres (paliers, barème, indices, gels) arrivent avec les parties (E2). Les valeurs par défaut sont celles de la v1.
/// </summary>
public sealed class DailyOptions
{
    public const string Section = "Daily";

    /// <summary>Morceaux d'un nouveau défi. Un défi déjà généré garde les siens (la fin de partie compte les morceaux réels, piège 38).</summary>
    public int TracksPerChallenge { get; set; } = 5;

    /// <summary>
    /// Jours pendant lesquels un morceau déjà tiré ne peut pas l'être de nouveau. Un morceau tiré le jour J est
    /// de nouveau tirable à partir de J + cooldown + 1 (règle de la v1, <c>LastUsedDate &lt; jour - cooldown</c>).
    /// </summary>
    public int TrackCooldownDays { get; set; } = 30;
}
