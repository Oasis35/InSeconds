namespace InSeconds.Api.Modules.Gameplay.Contracts;

/// <summary>
/// Une manche sur un morceau : ce que la mécanique d'un morceau garde, indépendamment
/// du mode qui l'utilise (Daily, Runs). Objet valeur immuable : chaque action rend une
/// nouvelle manche. Le mode la range comme il veut (Daily : position en cours et durée écoutée
/// de la session) et la reconstitue par <see cref="Resume"/>.
/// <para>
/// La manche ne connaît **ni le morceau ni les points** : l'identité du morceau et le verrou (piège 35) sont
/// l'affaire du mode, le calcul des points aussi (<see cref="RoundOutcome"/> n'en contient pas).
/// </para>
/// </summary>
public sealed record TrackRound
{
    private TrackRound(decimal listenedSeconds)
    {
        ListenedSeconds = listenedSeconds;
    }

    /// <summary>La manche d'un morceau qu'on n'a pas encore écouté.</summary>
    public static TrackRound Start { get; } = new(0);

    /// <summary>
    /// La plus longue durée déjà écoutée (le plancher anti-triche, piège 35) : celle que le serveur a vue, jamais
    /// celle que le client annonce. Le joueur ne peut plus choisir un palier plus court que ce plancher.
    /// </summary>
    public decimal ListenedSeconds { get; }

    /// <summary>Reconstitue une manche enregistrée (durée écoutée de la session).</summary>
    public static TrackRound Resume(decimal listenedSeconds)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(listenedSeconds);
        return new TrackRound(listenedSeconds);
    }

    /// <summary>
    /// Note une écoute. On garde le **maximum** : une écoute plus courte (rechargement de la page, appel direct)
    /// ne réduit jamais le plancher, et rejouer le même palier ne change rien.
    /// </summary>
    public TrackRound Listen(decimal seconds)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(seconds);
        return seconds > ListenedSeconds ? new TrackRound(seconds) : this;
    }

    /// <summary>
    /// Corrige la réponse du joueur. <paramref name="claimedSeconds"/> est le palier qu'il annonce avoir
    /// écouté : s'il est **inférieur au plancher** vu par le serveur, la réponse est refusée (écouter longuement
    /// puis annoncer un palier plus court pour gagner plus). Un morceau sans extrait
    /// (palier 0, jamais écouté) n'a pas de plancher. Le résultat ne contient pas de points.
    /// </summary>
    public AnswerResult Answer(decimal claimedSeconds, string? artist, string? title, TrackNames expected, IAnswerMatcher matcher)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(claimedSeconds);
        ArgumentNullException.ThrowIfNull(expected);
        ArgumentNullException.ThrowIfNull(matcher);

        if (claimedSeconds < ListenedSeconds)
            return AnswerResult.BelowFloor(ListenedSeconds);

        return AnswerResult.Accepted(new RoundOutcome(
            matcher.IsMatch(artist, expected.Artist),
            matcher.IsMatch(title, expected.Title) || (expected.AltTitles?.Any(alt => matcher.IsMatch(title, alt)) ?? false),
            claimedSeconds));
    }
}

/// <summary>Résultat d'une réponse : la correction, ou le refus parce que le palier annoncé est sous le plancher.</summary>
public sealed record AnswerResult
{
    private AnswerResult(RoundOutcome? outcome, decimal? floorSeconds)
    {
        Outcome = outcome;
        FloorSeconds = floorSeconds;
    }

    /// <summary>La correction ; <c>null</c> si la réponse est refusée.</summary>
    public RoundOutcome? Outcome { get; }

    /// <summary>Pour un refus : le plancher d'écoute que le palier annoncé n'atteint pas.</summary>
    public decimal? FloorSeconds { get; }

    public bool IsAccepted => Outcome is not null;

    public static AnswerResult Accepted(RoundOutcome outcome) => new(outcome, null);

    public static AnswerResult BelowFloor(decimal floorSeconds) => new(null, floorSeconds);
}
