using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.Api.Modules.Runs.Domain;

/// <summary>Où en est une partie (colonne <c>status</c>).</summary>
public enum RunSessionStatus : short
{
    /// <summary>En cours.</summary>
    Pending = 0,

    /// <summary>Terminée en « Série complète » : toutes les manches du plafond jouées avec au moins une vie (1 : l'ancienne partie « gagnée », vidée par la migration <c>SerieRules</c>).</summary>
    Completed = 1,

    /// <summary>Terminée : le joueur n'a plus de vie.</summary>
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

    /// <summary>Ce morceau n'existe pas dans le défi (pas encore tiré, ou hors de la partie).</summary>
    Unknown,
}

/// <summary>Ce qu'une réponse (ou une neutralisation) a fait de la partie.</summary>
public enum RunStepOutcome
{
    /// <summary>La manche continue.</summary>
    Continue,

    /// <summary>Le morceau terminait sa manche : la suivante commence, à un autre palier ou au même.</summary>
    RoundDone,

    /// <summary>Le joueur n'a plus de vie : la partie est finie.</summary>
    Over,

    /// <summary>La dernière manche du plafond est jouée avec au moins une vie : la Série est complète, la partie est finie.</summary>
    Complete,
}

/// <param name="Round">La manche du morceau qui vient de recevoir sa réponse.</param>
/// <param name="Outcome">Ce que la réponse a fait de la partie.</param>
/// <param name="FromStep">Le palier de cette manche.</param>
/// <param name="ToStep">Le palier de la manche suivante ; égal à <paramref name="FromStep"/> quand la manche ne l'a pas fait bouger ou que la partie est finie.</param>
public sealed record RunStep(int Round, RunStepOutcome Outcome, int FromStep, int ToStep)
{
    /// <summary>Ce morceau terminait sa manche (ou la partie).</summary>
    public bool EndsRound => Outcome != RunStepOutcome.Continue;

    /// <summary>Ce morceau termine la partie (vies épuisées, ou Série complète).</summary>
    public bool EndsRun => Outcome is RunStepOutcome.Over or RunStepOutcome.Complete;
}

/// <summary>
/// La partie d'un joueur sur un défi (une seule par joueur et par défi : index unique), pour l'auteur comme pour un ami.
/// <para>
/// **Le morceau en cours est toujours le premier sans réponse** (le verrou, piège 35) : les morceaux se jouent dans l'ordre. Une erreur, un morceau
/// passé ou une réponse tardive coûte une vie ; une moitié juste rapporte la moitié des points sans en coûter. À la fin d'une manche, son palier
/// décide de celui de la suivante (<see cref="RunSteps"/>). La partie s'arrête à la dernière vie.
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

    /// <summary>Quand l'extrait du morceau en cours a été envoyé pour la première fois (la borne du départ du chrono).</summary>
    public DateTimeOffset? CurrentServedAt { get; private set; }

    /// <summary>Le départ du chrono du morceau en cours : son premier son, annoncé par le navigateur, au plus <see cref="MaxClockWait"/> après l'envoi.</summary>
    public DateTimeOffset? CurrentClockAt { get; private set; }

    /// <summary>
    /// Le plus long délai accepté entre l'envoi de l'extrait et le premier son (lire la réponse d'avant, « Morceau suivant ») : un navigateur qui tarde
    /// à annoncer son premier son ne gagne pas plus de temps.
    /// </summary>
    public static readonly TimeSpan MaxClockWait = TimeSpan.FromSeconds(30);

    /// <summary>La marge accordée au réseau après la fin du chrono : la réponse envoyée à zéro arrive un peu après.</summary>
    public static readonly TimeSpan ClockGrace = TimeSpan.FromSeconds(5);

    /// <summary>Les manches terminées (toutes leurs réponses données) : ce que la Série a fait « tenir ».</summary>
    public short RoundsPassed { get; private set; }

    public int TotalScore { get; private set; }

    public DateTimeOffset StartedAt { get; private set; }

    public DateTimeOffset? EndedAt { get; private set; }

    public IReadOnlyList<RunAnswer> Answers => _answers;

    /// <summary>La position du morceau en cours : le premier sans réponse.</summary>
    public int NextPosition => _answers.Count + 1;

    public bool IsPending => Status == RunSessionStatus.Pending;

    /// <summary>La partie est finie : vies épuisées ou Série complète (pas un abandon).</summary>
    public bool IsFinished => Status is RunSessionStatus.Lost or RunSessionStatus.Completed;

    public static RunSession Start(int challengeId, Guid playerId, DateTimeOffset now) =>
        new() { ChallengeId = challengeId, PlayerId = playerId, Status = RunSessionStatus.Pending, CurrentPosition = 1, StartedAt = now };

    /// <summary>Ce morceau est-il celui qu'on peut jouer maintenant ? <paramref name="trackCount"/> est le nombre de morceaux **déjà tirés** du défi.</summary>
    public RunTrackTurn TurnOf(int position, int trackCount)
    {
        if (position < 1 || position > trackCount)
            return RunTrackTurn.Unknown;
        if (position < NextPosition)
            return RunTrackTurn.AlreadyAnswered;
        return position == NextPosition ? RunTrackTurn.Current : RunTrackTurn.NotYet;
    }

    /// <summary>La manche du morceau en cours ; vide une fois la partie finie.</summary>
    public int? CurrentRound(RunRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        return IsPending ? rules.RoundOf(NextPosition) : null;
    }

    /// <summary>Le compte des réponses d'une manche (morceaux neutralisés exclus).</summary>
    public RoundTally TallyOf(RunRules rules, int round)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var inRound = _answers.Where(a => !a.Neutralized && rules.RoundOf(a.Position) == round).ToList();
        return new RoundTally(inRound.Count(a => a.IsFull), inRound.Count(a => a.IsHalf), inRound.Count(a => a.IsFailed));
    }

    /// <summary>
    /// Le palier de la manche <paramref name="round"/> : la première manche au palier le plus long, puis, de manche en manche, ce que le déroulé de la
    /// précédente décide (<see cref="RunSteps.Next"/>). Une manche pas encore jouée mais dont les précédentes sont finies a son palier ; les suivantes
    /// se calculent comme si les manches intermédiaires étaient neutres.
    /// </summary>
    public int StepOf(RunRules rules, int round)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var step = 0;
        for (var r = 1; r < round; r++)
            step = RunSteps.Next(step, TallyOf(rules, r), rules.LastStep, rules.ShortenOnNoLifeLost, rules.HoldOnLifeLost);
        return step;
    }

    /// <summary>Les vies qui restent : celles du départ, moins une par morceau raté, plus une (jamais au-dessus du départ) par manche finie sans vie perdue.</summary>
    public int LivesLeft(RunRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        return Math.Max(0, LifeTimeline(rules).LastOrDefault()?.LivesAfter ?? rules.Lives);
    }

    /// <summary>Cette manche, finie sans vie perdue, a rendu une vie (la partie n'en avait pas déjà le maximum).</summary>
    public bool RegainedLife(RunRules rules, int round)
    {
        ArgumentNullException.ThrowIfNull(rules);
        return LifeTimeline(rules).Any(r => r.Round == round && r.Regained);
    }

    private sealed record LifeRound(int Round, int LivesAfter, bool Regained);

    // Les vies manche après manche, rejouées dans l'ordre des réponses : un raté en retire une tout de suite, la fin d'une manche sans raté en rend une.
    private List<LifeRound> LifeTimeline(RunRules rules)
    {
        var timeline = new List<LifeRound>();
        var lives = rules.Lives;
        foreach (var round in _answers.GroupBy(a => rules.RoundOf(a.Position)).OrderBy(g => g.Key))
        {
            var failed = round.Count(a => a.IsFailed);
            lives -= failed;
            var finished = round.Count() >= rules.TracksPerRound;
            var regained = rules.RegainLife && finished && failed == 0 && lives > 0 && lives < rules.Lives;
            if (regained)
                lives++;
            timeline.Add(new LifeRound(round.Key, lives, regained));
        }

        return timeline;
    }

    /// <summary>La durée d'écoute fixe du morceau en cours : celle du palier de sa manche.</summary>
    public decimal ListenSecondsOf(RunRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        return rules.ListenAt(StepOf(rules, rules.RoundOf(NextPosition)));
    }

    /// <summary>La manche Gameplay du morceau en cours, reconstituée de la partie (pas d'indice).</summary>
    public TrackRound RoundOfCurrentTrack() =>
        CurrentPosition == NextPosition ? TrackRound.Resume(CurrentListenedSeconds ?? 0) : TrackRound.Start;

    /// <summary>L'extrait du morceau en cours part vers le navigateur : seul le premier envoi compte (une reprise ou une adresse fraîche ne remet rien à zéro).</summary>
    public void ServeCurrent(DateTimeOffset now)
    {
        RequirePending();
        CurrentServedAt ??= now;
    }

    /// <summary>
    /// Le premier son du morceau en cours : le chrono part, une seule fois, au plus <see cref="MaxClockWait"/> après l'envoi de l'extrait.
    /// </summary>
    public void StartClock(DateTimeOffset now)
    {
        RequirePending();
        if (CurrentClockAt is not null)
            return;
        CurrentClockAt = CurrentServedAt is { } served && now > served + MaxClockWait ? served + MaxClockWait : now;
    }

    /// <summary>
    /// Le départ du chrono du morceau en cours : le premier son, sinon (navigateur qui ne l'a pas annoncé) la limite après l'envoi ; vide sans
    /// chrono ou si l'extrait n'a jamais été envoyé.
    /// </summary>
    public DateTimeOffset? ClockStart(RunRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        if (!rules.HasClock)
            return null;
        return CurrentClockAt ?? CurrentServedAt + MaxClockWait;
    }

    /// <summary>
    /// Les secondes qui restent au chrono du morceau en cours, s'il est parti (0 une fois écoulé) : au premier son annoncé, ou à la limite après
    /// l'envoi une fois qu'elle est passée sans annonce (le joueur qui revient le voit tourner).
    /// </summary>
    public decimal? ClockRemaining(RunRules rules, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(rules);
        if (ClockStart(rules) is not { } start || (CurrentClockAt is null && now < start))
            return null;
        var left = (decimal)(start.AddSeconds(rules.AnswerSeconds) - now).TotalSeconds;
        return Math.Max(0m, decimal.Round(left, 1));
    }

    /// <summary>La réponse arrive après le chrono (marge réseau comprise) : une vie perdue, aucun point.</summary>
    public bool IsLate(RunRules rules, DateTimeOffset now) =>
        ClockStart(rules) is { } start && now > start.AddSeconds(rules.AnswerSeconds) + ClockGrace;

    /// <summary>Enregistre la manche du morceau en cours (ce que <see cref="TrackRound.Listen"/> a rendu).</summary>
    public void KeepRound(TrackRound round)
    {
        ArgumentNullException.ThrowIfNull(round);
        RequirePending();
        CurrentPosition = (short)NextPosition;
        CurrentListenedSeconds = round.ListenedSeconds;
    }

    /// <summary>
    /// Note la réponse au morceau en cours (les points du palier de sa manche), libère le verrou, retire une vie si la réponse n'a rien de juste, et
    /// tranche la manche si c'était son dernier morceau. Le verdict seul est gardé, jamais le texte saisi. Une réponse arrivée après le chrono
    /// (<see cref="IsLate"/>) compte comme un morceau passé.
    /// </summary>
    public RunStep Answer(RunChallenge challenge, RoundOutcome outcome, IRunScoringPolicy scoring, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(outcome);
        ArgumentNullException.ThrowIfNull(scoring);
        var track = CurrentTrackOf(challenge);
        if (IsLate(challenge.Rules, now))
            outcome = outcome with { ArtistCorrect = false, TitleCorrect = false };
        var points = scoring.Points(outcome, challenge.Rules.PointsAt(StepOf(challenge.Rules, track.Round)));
        return Record(challenge.Rules, RunAnswer.Create(track.Position, outcome.ArtistCorrect, outcome.TitleCorrect, points, neutralized: false, now), now);
    }

    /// <summary>
    /// Le morceau en cours n'a plus d'extrait (Deezer l'a confirmé, jamais sur demande du client) : il est neutralisé, ne rapporte rien, ne coûte
    /// aucune vie et ne compte pour rien dans le palier de sa manche.
    /// </summary>
    public RunStep Neutralize(RunChallenge challenge, DateTimeOffset now)
    {
        var track = CurrentTrackOf(challenge);
        return Record(challenge.Rules, RunAnswer.Create(track.Position, false, false, 0, neutralized: true, now), now);
    }

    public void Abandon(DateTimeOffset now)
    {
        RequirePending();
        Status = RunSessionStatus.Abandoned;
        End(now);
    }

    private RunStep Record(RunRules rules, RunAnswer answer, DateTimeOffset now)
    {
        var round = rules.RoundOf(answer.Position);
        var from = StepOf(rules, round);
        _answers.Add(answer);
        TotalScore += answer.Points;
        CurrentPosition = (short)NextPosition;
        CurrentListenedSeconds = null;
        CurrentServedAt = null;
        CurrentClockAt = null;

        if (LivesLeft(rules) == 0)
        {
            // La dernière vie perdue arrête la partie net, au milieu d'une manche s'il le faut : la manche en cours ne compte pas comme tenue.
            Status = RunSessionStatus.Lost;
            End(now);
            return new RunStep(round, RunStepOutcome.Over, from, from);
        }

        if (rules.RoundOf(NextPosition) == round)
            return new RunStep(round, RunStepOutcome.Continue, from, from);

        RoundsPassed++;
        if (rules.HasCap && round >= rules.MaxRounds)
        {
            // La dernière manche du plafond, jouée avec au moins une vie : Série complète, avec ses bonus (par vie restante, et pour la complétion).
            Status = RunSessionStatus.Completed;
            TotalScore += BonusOf(rules);
            End(now);
            return new RunStep(round, RunStepOutcome.Complete, from, from);
        }

        return new RunStep(round, RunStepOutcome.RoundDone, from, StepOf(rules, round + 1));
    }

    /// <summary>Les points de bonus d'une Série complète : une vie restante rapporte <see cref="RunRules.LifeBonus"/>, la complétion <see cref="RunRules.CompleteBonus"/>.</summary>
    public int BonusOf(RunRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        return Status == RunSessionStatus.Completed ? (LivesLeft(rules) * rules.LifeBonus) + rules.CompleteBonus : 0;
    }

    private RunChallengeTrack CurrentTrackOf(RunChallenge challenge)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (challenge.Id != ChallengeId)
            throw new ArgumentException("Ce n'est pas le défi de cette partie.", nameof(challenge));
        RequirePending();
        return challenge.TrackAt(NextPosition) ?? throw new InvalidOperationException("Le morceau en cours n'est pas encore tiré.");
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
        CurrentServedAt = null;
        CurrentClockAt = null;
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

    /// <summary>Le morceau n'avait plus d'extrait : il ne compte pour rien, posé par le serveur.</summary>
    public bool Neutralized { get; private set; }

    public DateTimeOffset AnsweredAt { get; private set; }

    /// <summary>Artiste et titre justes.</summary>
    public bool IsFull => !Neutralized && ArtistCorrect && TitleCorrect;

    /// <summary>Un seul des deux de juste : la moitié des points, pas de vie perdue.</summary>
    public bool IsHalf => !Neutralized && ArtistCorrect != TitleCorrect;

    /// <summary>Rien de juste (morceau passé, réponse tardive ou fausse) : une vie perdue.</summary>
    public bool IsFailed => !Neutralized && !ArtistCorrect && !TitleCorrect;

    public static RunAnswer Create(short position, bool artistCorrect, bool titleCorrect, int points, bool neutralized, DateTimeOffset now) =>
        new() { Position = position, ArtistCorrect = artistCorrect, TitleCorrect = titleCorrect, Points = points, Neutralized = neutralized, AnsweredAt = now };
}

/// <summary>
/// Le record personnel d'un joueur (une ligne par joueur, invité compris) : son meilleur score et son plus grand nombre de manches passées, chacun le
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
    /// manches passées améliorent le plus grand nombre de manches passées, même avec un score moindre.
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

/// <summary>L'interrupteur de l'admin : ce compte peut lancer un run. Un admin aussi n'a l'accès que par sa ligne (il peut se le retirer pour voir le jeu sans Survie).</summary>
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

    /// <summary>Un seul « défi reçu » à la fois par joueur (deux onglets qui ouvrent le même lien ne se marchent pas dessus). Exige une transaction.</summary>
    Task LockReceivedAsync(Guid playerId, CancellationToken ct);

    /// <summary>
    /// Réserve ce défi jusqu'à la fin de la transaction et en relit l'état (règles, morceaux) : le thème d'une manche est écrit sur le défi,
    /// partagé par tous ses joueurs, et deux joueurs qui y arrivent ensemble (le créateur qui choisit, un ami qui reçoit le thème mystère) se suivent
    /// au lieu d'écrire chacun le leur.
    /// </summary>
    Task LockChallengeAsync(RunChallenge challenge, CancellationToken ct);

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

    /// <summary>Le niveau de ce joueur (sous le même verrou que son record) ; vide avant sa première partie finie.</summary>
    Task<RunLevel?> FindLevelAsync(Guid playerId, CancellationToken ct);

    void AddLevel(RunLevel level);

    Task<RunAccess?> FindAccessAsync(Guid playerId, CancellationToken ct);

    void AddAccess(RunAccess access);

    void RemoveAccess(RunAccess access);

    /// <summary>Le défi d'ami reçu par ce joueur sur ce défi, s'il en a un (refusé compris).</summary>
    Task<RunReceivedChallenge?> FindReceivedChallengeAsync(Guid playerId, int challengeId, CancellationToken ct);

    void AddReceivedChallenge(RunReceivedChallenge received);
}
