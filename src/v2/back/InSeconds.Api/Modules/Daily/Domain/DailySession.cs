using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>État d'une partie (colonne <c>status</c>, § 4.4 du plan v2).</summary>
public enum SessionStatus : short
{
    /// <summary>En cours : le joueur peut la reprendre.</summary>
    Pending = 0,

    /// <summary>Tous les morceaux du défi ont reçu une réponse.</summary>
    Completed = 1,

    /// <summary>Le joueur a cliqué sur « Abandonner ».</summary>
    Abandoned = 2,

    /// <summary>Une partie restée en cours que l'expiration paresseuse (au démarrage d'une partie du jour suivant) a basculée : le joueur est parti sans terminer ni abandonner.</summary>
    Expired = 3,
}

/// <summary>Pourquoi une action sur le morceau en cours est refusée (piège 35).</summary>
public enum TrackTurn
{
    /// <summary>C'est le morceau en cours : l'action est permise.</summary>
    Current,

    /// <summary>Ce morceau a déjà reçu sa réponse.</summary>
    AlreadyAnswered,

    /// <summary>Le morceau en cours n'a pas encore reçu sa réponse : on ne passe pas à un autre.</summary>
    NotYet,

    /// <summary>Ce morceau n'existe pas dans le défi.</summary>
    Unknown,
}

/// <summary>
/// La partie d'un joueur sur le défi d'un jour (§ 5.4 du plan v2), anciennement <c>GameSession</c> : une seule par joueur et par défi.
/// <para>
/// **Le morceau en cours est toujours le premier sans réponse** : les morceaux se jouent dans l'ordre, et on ne déplace jamais ce
/// verrou (piège 35). La partie y range ce que sa <see cref="TrackRound"/> garde (durée écoutée, niveau d'indice), sans que
/// le client le fournisse jamais. Elle se termine d'elle-même quand elle atteint le nombre **réel** de morceaux du défi (piège 38).
/// </para>
/// </summary>
public sealed class DailySession
{
    private readonly List<SessionAnswer> _answers = [];

    private DailySession()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence) : la réponse de démarrage le porte avant l'enregistrement.</summary>
    public int Id { get; private set; }

    public Guid PlayerId { get; private set; }

    public int ChallengeId { get; private set; }

    public SessionStatus Status { get; private set; }

    public DateTimeOffset StartedAt { get; private set; }

    public DateTimeOffset? EndedAt { get; private set; }

    public int TotalScore { get; private set; }

    public decimal TotalListenedSeconds { get; private set; }

    /// <summary>Le morceau sur lequel porte <see cref="CurrentListenedSeconds"/> (le verrou), vide tant que le joueur n'a rien écouté dessus.</summary>
    public short? CurrentPosition { get; private set; }

    /// <summary>Le plancher d'écoute du morceau verrouillé : ce que le serveur a vu (jamais ce que le client annonce).</summary>
    public decimal? CurrentListenedSeconds { get; private set; }

    /// <summary>Le niveau d'indice le plus haut révélé sur le morceau verrouillé.</summary>
    public short CurrentHintLevel { get; private set; }

    /// <summary>Gels consommés par la complétion (relu pour les toasts de fin de partie).</summary>
    public short FreezesUsed { get; private set; }

    /// <summary>Un gel a été gagné par la complétion.</summary>
    public bool FreezeEarned { get; private set; }

    public IReadOnlyList<SessionAnswer> Answers => _answers;

    public int AnsweredCount => _answers.Count;

    /// <summary>La position du morceau en cours : le premier sans réponse (N + 1 une fois tous répondus).</summary>
    public int NextPosition => _answers.Count + 1;

    public static DailySession Start(Guid playerId, int challengeId, DateTimeOffset now) =>
        new() { PlayerId = playerId, ChallengeId = challengeId, Status = SessionStatus.Pending, StartedAt = now };

    /// <summary>
    /// Ce morceau est-il celui qu'on peut jouer maintenant ? <paramref name="trackCount"/> est le nombre **réel** de morceaux du défi.
    /// </summary>
    public TrackTurn TurnOf(int position, int trackCount)
    {
        if (position < 1 || position > trackCount)
            return TrackTurn.Unknown;
        if (position < NextPosition)
            return TrackTurn.AlreadyAnswered;
        return position == NextPosition ? TrackTurn.Current : TrackTurn.NotYet;
    }

    /// <summary>
    /// La manche du morceau en cours, reconstituée de la partie. Le niveau d'indice relu est **borné à la politique** (revue de
    /// D1) : un réglage qui perdrait un niveau ne laisse pas un niveau inexistant pénaliser le score.
    /// </summary>
    public TrackRound RoundOfCurrentTrack(HintPolicy policy)
    {
        ArgumentNullException.ThrowIfNull(policy);
        if (CurrentPosition != NextPosition)
            return TrackRound.Start;
        return TrackRound.Resume(CurrentListenedSeconds ?? 0, Math.Min(CurrentHintLevel, policy.LevelCount));
    }

    /// <summary>Enregistre la manche du morceau en cours (ce que <see cref="TrackRound.Listen"/> ou <see cref="TrackRound.RevealHint"/> a rendu).</summary>
    public void KeepRound(TrackRound round)
    {
        ArgumentNullException.ThrowIfNull(round);
        CurrentPosition = (short)NextPosition;
        CurrentListenedSeconds = round.ListenedSeconds;
        CurrentHintLevel = (short)round.HintLevel;
    }

    /// <summary>Note la réponse au morceau en cours, libère le verrou, et termine la partie si c'était le dernier morceau.</summary>
    /// <returns>Vrai si cette réponse termine la partie.</returns>
    public bool Answer(
        RoundOutcome outcome, int score, bool wasExtended, string? artistAnswer, string? titleAnswer, int trackCount, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(outcome);
        _answers.Add(new SessionAnswer(Id, (short)NextPosition, outcome, score, wasExtended, artistAnswer, titleAnswer, now));
        TotalScore += score;
        TotalListenedSeconds += outcome.ListenedSeconds;
        ReleaseLock();

        if (_answers.Count < trackCount)
            return false;

        Status = SessionStatus.Completed;
        EndedAt = now;
        return true;
    }

    public void RecordStreakEffect(StreakCompletion completion)
    {
        FreezesUsed = (short)completion.FreezesUsed;
        FreezeEarned = completion.FreezeEarned;
    }

    public void Abandon(DateTimeOffset now)
    {
        Status = SessionStatus.Abandoned;
        EndedAt = now;
    }

    /// <summary>Expiration paresseuse : **pas** <see cref="SessionStatus.Abandoned"/>, que les statistiques de l'admin distinguent.</summary>
    public void Expire(DateTimeOffset now)
    {
        Status = SessionStatus.Expired;
        EndedAt = now;
    }

    private void ReleaseLock()
    {
        CurrentPosition = null;
        CurrentListenedSeconds = null;
        CurrentHintLevel = 0;
    }
}

/// <summary>La réponse à un morceau du défi (§ 4.4 du plan v2).</summary>
public sealed class SessionAnswer
{
    private SessionAnswer()
    {
    }

    internal SessionAnswer(
        int sessionId, short position, RoundOutcome outcome, int score, bool wasExtended, string? artistAnswer, string? titleAnswer, DateTimeOffset answeredAt)
    {
        SessionId = sessionId;
        Position = position;
        ListenedSeconds = outcome.ListenedSeconds;
        WasExtended = wasExtended;
        HintLevel = (short)outcome.HintLevelUsed;
        ArtistAnswer = artistAnswer;
        TitleAnswer = titleAnswer;
        ArtistCorrect = outcome.ArtistCorrect;
        TitleCorrect = outcome.TitleCorrect;
        Score = score;
        AnsweredAt = answeredAt;
    }

    public int SessionId { get; private set; }

    public short Position { get; private set; }

    public decimal ListenedSeconds { get; private set; }

    public bool WasExtended { get; private set; }

    public short HintLevel { get; private set; }

    public string? ArtistAnswer { get; private set; }

    public string? TitleAnswer { get; private set; }

    public bool ArtistCorrect { get; private set; }

    public bool TitleCorrect { get; private set; }

    public int Score { get; private set; }

    /// <summary>Vide pour l'historique repris de la v1.</summary>
    public DateTimeOffset? AnsweredAt { get; private set; }
}
