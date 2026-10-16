namespace InSeconds.Api.Modules.Gameplay.Contracts;

/// <summary>
/// Une manche sur un morceau (§ 5.4 du plan v2) : ce que la mécanique d'un morceau garde, indépendamment
/// du mode qui l'utilise (Daily aujourd'hui, Runs plus tard). Objet valeur immuable : chaque action rend une
/// nouvelle manche. Le mode la range comme il veut (Daily : position en cours, durée écoutée, niveau d'indice
/// de la session) et la reconstitue par <see cref="Resume"/>.
/// <para>
/// La manche ne connaît **ni le morceau ni les points** : l'identité du morceau et le verrou (piège 35) sont
/// l'affaire du mode, le calcul des points aussi (<see cref="RoundOutcome"/> n'en contient pas).
/// </para>
/// </summary>
public sealed record TrackRound
{
    private TrackRound(decimal listenedSeconds, int hintLevel)
    {
        ListenedSeconds = listenedSeconds;
        HintLevel = hintLevel;
    }

    /// <summary>La manche d'un morceau qu'on n'a pas encore écouté.</summary>
    public static TrackRound Start { get; } = new(0, 0);

    /// <summary>
    /// La plus longue durée déjà écoutée (le plancher anti-triche, piège 35) : celle que le serveur a vue, jamais
    /// celle que le client annonce. Le joueur ne peut plus choisir un palier plus court que ce plancher.
    /// </summary>
    public decimal ListenedSeconds { get; }

    /// <summary>Le niveau d'indice le plus haut révélé (0 : aucun). Ne redescend jamais.</summary>
    public int HintLevel { get; }

    /// <summary>Reconstitue une manche enregistrée (durée écoutée et niveau d'indice de la session).</summary>
    public static TrackRound Resume(decimal listenedSeconds, int hintLevel)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(listenedSeconds);
        ArgumentOutOfRangeException.ThrowIfNegative(hintLevel);
        return new TrackRound(listenedSeconds, hintLevel);
    }

    /// <summary>
    /// Note une écoute. On garde le **maximum** : une écoute plus courte (rechargement de la page, appel direct)
    /// ne réduit jamais le plancher, et rejouer le même palier ne change rien.
    /// </summary>
    public TrackRound Listen(decimal seconds)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(seconds);
        return seconds > ListenedSeconds ? new TrackRound(seconds, HintLevel) : this;
    }

    /// <summary>
    /// Révèle l'indice d'un niveau, si la politique du mode le propose et si la durée écoutée a atteint son
    /// seuil. Le niveau d'indice de la manche garde son maximum : redemander un niveau plus bas est accepté
    /// (le contenu est rendu de nouveau) sans rien dégrader. Écouter plus ne révèle jamais d'indice et ne remet
    /// rien à zéro : seul le clic explicite révèle, et ce qui est révélé reste révélé.
    /// </summary>
    public HintReveal RevealHint(int level, HintPolicy policy)
    {
        ArgumentNullException.ThrowIfNull(policy);
        if (!policy.Proposes(level))
            return HintReveal.UnknownLevel();

        var threshold = policy.UnlockSecondsOf(level);
        if (ListenedSeconds < threshold)
            return HintReveal.NotUnlocked(threshold);

        return HintReveal.Accepted(level > HintLevel ? new TrackRound(ListenedSeconds, level) : this);
    }

    /// <summary>
    /// Corrige la réponse du joueur. <paramref name="claimedSeconds"/> est le palier qu'il annonce avoir
    /// écouté : s'il est **inférieur au plancher** vu par le serveur, la réponse est refusée (écouter longuement
    /// ou débloquer un indice, puis annoncer un palier plus court pour gagner plus). Un morceau sans extrait
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
            matcher.IsMatch(title, expected.Title),
            claimedSeconds,
            HintLevel));
    }
}

/// <summary>Pourquoi un indice est refusé.</summary>
public enum HintRefusal
{
    /// <summary>Le mode ne propose pas ce niveau d'indice.</summary>
    UnknownLevel,

    /// <summary>La durée écoutée n'a pas encore atteint le seuil de ce niveau.</summary>
    NotUnlocked,
}

/// <summary>Résultat d'une demande d'indice : la nouvelle manche, ou le refus et son motif.</summary>
public sealed record HintReveal
{
    private HintReveal(TrackRound? round, HintRefusal? refusal, decimal? unlocksAtSeconds)
    {
        Round = round;
        Refusal = refusal;
        UnlocksAtSeconds = unlocksAtSeconds;
    }

    /// <summary>La manche après la révélation ; <c>null</c> si l'indice est refusé.</summary>
    public TrackRound? Round { get; }

    public HintRefusal? Refusal { get; }

    /// <summary>Pour <see cref="HintRefusal.NotUnlocked"/> : la durée d'écoute qui débloque ce niveau.</summary>
    public decimal? UnlocksAtSeconds { get; }

    public bool IsAccepted => Refusal is null;

    public static HintReveal Accepted(TrackRound round) => new(round, null, null);

    public static HintReveal UnknownLevel() => new(null, HintRefusal.UnknownLevel, null);

    public static HintReveal NotUnlocked(decimal unlocksAtSeconds) => new(null, HintRefusal.NotUnlocked, unlocksAtSeconds);
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
