using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Où en est une partie (colonne <c>status</c>).</summary>
public enum RunSessionStatus : short
{
    /// <summary>En cours.</summary>
    Pending = 0,

    /// <summary>Les manches sont toutes passées.</summary>
    Won = 1,

    /// <summary>Une manche n'a pas atteint son objectif.</summary>
    Lost = 2,

    /// <summary>Abandonnée (bouton).</summary>
    Abandoned = 3,
}

/// <summary>Pourquoi une action sur un morceau est refusée (piège 35), comme au Daily.</summary>
public enum RunTrackTurn
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

/// <summary>Ce qu'une réponse (ou une neutralisation) a fait de la partie.</summary>
public enum RunStepOutcome
{
    /// <summary>La manche continue.</summary>
    Continue,

    /// <summary>Le morceau terminait sa manche, l'objectif est atteint : la manche suivante est débloquée.</summary>
    RoundPassed,

    /// <summary>La dernière manche est passée : la partie est gagnée.</summary>
    Won,

    /// <summary>Le morceau terminait sa manche, l'objectif n'est pas atteint : la partie est perdue.</summary>
    Lost,
}

/// <param name="Round">La manche du morceau qui vient de recevoir sa réponse.</param>
public sealed record RunStep(int Round, RunStepOutcome Outcome)
{
    /// <summary>Ce morceau terminait sa manche (passée ou non).</summary>
    public bool EndsRound => Outcome != RunStepOutcome.Continue;
}

/// <summary>
/// La partie d'un joueur sur un défi (une seule par joueur et par défi : index unique), pour l'auteur comme pour un ami.
/// <para>
/// **Le morceau en cours est toujours le premier sans réponse** (le verrou, piège 35) : les morceaux se jouent dans l'ordre. À la fin d'une manche, son
/// score (points arrondis) est comparé à l'objectif **figé dans les règles du défi** (<c>&gt;=</c>) : manche suivante, défaite ou victoire. Pleine
/// avant la fin, la jauge n'arrête rien : les morceaux restants se jouent. La partie se termine sur le nombre **réel** de morceaux du défi (piège 38),
/// jamais sur un réglage.
/// </para>
/// </summary>
public sealed class RunSession
{
    private readonly List<RunAnswer> _answers = [];

    private RunSession()
    {
    }

    /// <summary>Attribué dès l'ajout (séquence) : la réponse de démarrage le porte avant l'enregistrement.</summary>
    public int Id { get; private set; }

    public int ChallengeId { get; private set; }

    public Guid PlayerId { get; private set; }

    public RunSessionStatus Status { get; private set; }

    /// <summary>Le morceau en cours (le verrou), vide hors partie en cours.</summary>
    public short? CurrentPosition { get; private set; }

    /// <summary>Le plus long passage écouté sur le morceau en cours, vu par le serveur.</summary>
    public decimal? CurrentListenedSeconds { get; private set; }

    public short RoundsPassed { get; private set; }

    public int TotalScore { get; private set; }

    public DateTimeOffset StartedAt { get; private set; }

    public DateTimeOffset? EndedAt { get; private set; }

    public IReadOnlyList<RunAnswer> Answers => _answers;

    /// <summary>La position du morceau en cours : le premier sans réponse (N + 1 une fois tous répondus).</summary>
    public int NextPosition => _answers.Count + 1;

    public bool IsPending => Status == RunSessionStatus.Pending;

    public static RunSession Start(int challengeId, Guid playerId, DateTimeOffset now) =>
        new() { ChallengeId = challengeId, PlayerId = playerId, Status = RunSessionStatus.Pending, CurrentPosition = 1, StartedAt = now };

    /// <summary>Ce morceau est-il celui qu'on peut jouer maintenant ? <paramref name="trackCount"/> est le nombre **réel** de morceaux du défi.</summary>
    public RunTrackTurn TurnOf(int position, int trackCount)
    {
        if (position < 1 || position > trackCount)
            return RunTrackTurn.Unknown;
        if (position < NextPosition)
            return RunTrackTurn.AlreadyAnswered;
        return position == NextPosition ? RunTrackTurn.Current : RunTrackTurn.NotYet;
    }

    /// <summary>La manche Gameplay du morceau en cours, reconstituée de la partie (pas d'indice au proto 1).</summary>
    public TrackRound RoundOfCurrentTrack() =>
        CurrentPosition == NextPosition ? TrackRound.Resume(CurrentListenedSeconds ?? 0, 0) : TrackRound.Start;

    /// <summary>Enregistre la manche du morceau en cours (ce que <see cref="TrackRound.Listen"/> a rendu).</summary>
    public void KeepRound(TrackRound round)
    {
        ArgumentNullException.ThrowIfNull(round);
        RequirePending();
        CurrentPosition = (short)NextPosition;
        CurrentListenedSeconds = round.ListenedSeconds;
    }

    /// <summary>
    /// Note la réponse au morceau en cours (points au multiplicateur de sa manche), libère le verrou, et tranche la manche si c'était son dernier
    /// morceau. Le verdict seul est gardé, jamais le texte saisi.
    /// </summary>
    public RunStep Answer(RunChallenge challenge, RoundOutcome outcome, IRunScoringPolicy scoring, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(outcome);
        ArgumentNullException.ThrowIfNull(scoring);
        var track = CurrentTrackOf(challenge);
        var points = scoring.Points(outcome, track.Multiplier);
        return Record(challenge, RunAnswer.Create(track.Position, outcome.ArtistCorrect, outcome.TitleCorrect, points, neutralized: false, now), scoring, now);
    }

    /// <summary>
    /// Le morceau en cours n'a plus d'extrait (Deezer l'a confirmé, jamais sur demande du client) : il est neutralisé, ne rapporte rien et sort du
    /// maximum de sa manche, dont l'objectif se recalcule sur les morceaux restants. Une manche entièrement neutralisée est passée.
    /// </summary>
    public RunStep Neutralize(RunChallenge challenge, IRunScoringPolicy scoring, DateTimeOffset now)
    {
        var track = CurrentTrackOf(challenge);
        return Record(challenge, RunAnswer.Create(track.Position, false, false, 0, neutralized: true, now), scoring, now);
    }

    public void Abandon(DateTimeOffset now)
    {
        RequirePending();
        Status = RunSessionStatus.Abandoned;
        End(now);
    }

    /// <summary>La manche <paramref name="round"/> de cette partie (score, objectif, maximum).</summary>
    public RoundProgress RoundProgressOf(RunChallenge challenge, int round, IRunScoringPolicy scoring) =>
        RunGauge.Of(challenge, _answers, round, scoring);

    private RunStep Record(RunChallenge challenge, RunAnswer answer, IRunScoringPolicy scoring, DateTimeOffset now)
    {
        var track = challenge.Tracks.First(t => t.Position == answer.Position);
        _answers.Add(answer);
        TotalScore += answer.Points;
        CurrentPosition = (short)NextPosition;
        CurrentListenedSeconds = null;

        var progress = RoundProgressOf(challenge, track.Round, scoring);
        if (!progress.Complete)
            return new RunStep(track.Round, RunStepOutcome.Continue);

        if (!progress.Reached)
        {
            Status = RunSessionStatus.Lost;
            End(now);
            return new RunStep(track.Round, RunStepOutcome.Lost);
        }

        RoundsPassed++;
        if (_answers.Count < challenge.Tracks.Count)
            return new RunStep(track.Round, RunStepOutcome.RoundPassed);

        Status = RunSessionStatus.Won;
        End(now);
        return new RunStep(track.Round, RunStepOutcome.Won);
    }

    private RunChallengeTrack CurrentTrackOf(RunChallenge challenge)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (challenge.Id != ChallengeId)
            throw new ArgumentException("Ce n'est pas le défi de cette partie.", nameof(challenge));
        RequirePending();
        return challenge.Tracks.FirstOrDefault(t => t.Position == NextPosition)
            ?? throw new InvalidOperationException("Tous les morceaux du défi ont déjà une réponse.");
    }

    private void RequirePending()
    {
        if (!IsPending)
            throw new InvalidOperationException("La partie n'est plus en cours.");
    }

    private void End(DateTimeOffset now)
    {
        EndedAt = now;
        CurrentPosition = null;
        CurrentListenedSeconds = null;
    }
}

/// <summary>La réponse d'une partie sur un morceau. **Jamais le texte saisi** (RGPD) : seulement les verdicts et les points.</summary>
public sealed class RunAnswer
{
    private RunAnswer()
    {
    }

    public int SessionId { get; private set; }

    public short Position { get; private set; }

    public bool ArtistCorrect { get; private set; }

    public bool TitleCorrect { get; private set; }

    public int Points { get; private set; }

    /// <summary>Le morceau n'avait plus d'extrait : retiré du maximum de sa manche, par le serveur.</summary>
    public bool Neutralized { get; private set; }

    public DateTimeOffset AnsweredAt { get; private set; }

    public static RunAnswer Create(short position, bool artistCorrect, bool titleCorrect, int points, bool neutralized, DateTimeOffset now) =>
        new() { Position = position, ArtistCorrect = artistCorrect, TitleCorrect = titleCorrect, Points = points, Neutralized = neutralized, AnsweredAt = now };
}

/// <summary>
/// Le record personnel d'un joueur (une ligne par joueur, invité compris) : son meilleur score et son meilleur disque (manches passées), chacun le
/// meilleur de ses parties gagnées ou perdues ; une partie abandonnée ne compte pas. Mis à jour dans la transaction qui termine la partie.
/// </summary>
public sealed class RunRecord
{
    private RunRecord()
    {
    }

    public Guid PlayerId { get; private set; }

    public int BestScore { get; private set; }

    public short BestRoundsPassed { get; private set; }

    /// <summary>La partie qui l'a établi.</summary>
    public int SessionId { get; private set; }

    public DateTimeOffset AchievedAt { get; private set; }

    public static RunRecord Create(Guid playerId, int bestScore, short bestRoundsPassed, int sessionId, DateTimeOffset now) =>
        new() { PlayerId = playerId, BestScore = bestScore, BestRoundsPassed = bestRoundsPassed, SessionId = sessionId, AchievedAt = now };

    /// <summary>Le premier record d'un joueur : sa première partie terminée.</summary>
    public static RunRecord First(RunSession session, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(session);
        return Create(session.PlayerId, session.TotalScore, session.RoundsPassed, session.Id, now);
    }

    /// <summary>
    /// Compare une partie terminée au record : un score strictement meilleur devient le record (et cette partie, celle qui l'a établi) ; plus de
    /// manches passées améliorent le meilleur disque, même avec un score moindre.
    /// </summary>
    public void Improve(RunSession session, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(session);
        if (session.PlayerId != PlayerId)
            throw new ArgumentException("Ce n'est pas une partie de ce joueur.", nameof(session));
        if (session.TotalScore > BestScore)
        {
            BestScore = session.TotalScore;
            SessionId = session.Id;
            AchievedAt = now;
        }

        if (session.RoundsPassed > BestRoundsPassed)
            BestRoundsPassed = session.RoundsPassed;
    }
}

/// <summary>L'interrupteur de l'admin : ce compte peut lancer un run (les admins le peuvent d'office, sans ligne).</summary>
public sealed class RunAccess
{
    private RunAccess()
    {
    }

    public Guid PlayerId { get; private set; }

    public DateTimeOffset GrantedAt { get; private set; }

    public static RunAccess Grant(Guid playerId, DateTimeOffset now) => new() { PlayerId = playerId, GrantedAt = now };
}

/// <summary>Écritures du module, nommées par l'intention.</summary>
public interface IRunsStore
{
    /// <summary>Ce code est déjà celui d'un défi (vérifié avant l'insertion, l'index unique restant le garde-fou).</summary>
    Task<bool> CodeExistsAsync(string code, CancellationToken ct);

    void AddChallenge(RunChallenge challenge);

    /// <summary>
    /// Réserve le démarrage d'une partie pour ce joueur jusqu'à la fin de la transaction (<c>pg_advisory_xact_lock</c>) : deux lancements ou deux
    /// démarrages simultanés se suivent.
    /// </summary>
    Task LockPlayerStartAsync(Guid playerId, CancellationToken ct);

    /// <summary>Réserve le record de ce joueur jusqu'à la fin de la transaction : deux parties qui se terminent ensemble ne le créent pas deux fois.</summary>
    Task LockRecordAsync(Guid playerId, CancellationToken ct);

    /// <summary>Le défi de ce code (déjà normalisé), avec ses morceaux.</summary>
    Task<RunChallenge?> FindChallengeAsync(string code, CancellationToken ct);

    Task<RunChallenge?> FindChallengeAsync(int challengeId, CancellationToken ct);

    /// <summary>La partie de ce joueur sur ce défi, avec ses réponses.</summary>
    Task<RunSession?> FindSessionAsync(int challengeId, Guid playerId, CancellationToken ct);

    /// <summary>La partie de cet identifiant si elle appartient à ce joueur, avec ses réponses, **verrouillée** jusqu'à la fin de la transaction.</summary>
    Task<RunSession?> FindSessionForUpdateAsync(int sessionId, Guid playerId, CancellationToken ct);

    /// <summary>La partie de cet identifiant si elle appartient à ce joueur, avec ses réponses, en lecture seule.</summary>
    Task<RunSession?> ReadSessionAsync(int sessionId, Guid playerId, CancellationToken ct);

    ValueTask AddAsync(RunSession session, CancellationToken ct);

    Task<RunRecord?> FindRecordAsync(Guid playerId, CancellationToken ct);

    void AddRecord(RunRecord record);

    Task<RunAccess?> FindAccessAsync(Guid playerId, CancellationToken ct);

    void AddAccess(RunAccess access);

    void RemoveAccess(RunAccess access);
}
