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
    private readonly List<RunSessionRound> _rounds = [];
    private readonly List<RunSessionCard> _cards = [];

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
    /// Le plus long délai accepté entre l'envoi de l'extrait et le premier son (lire la réponse d'avant, la ligne de palier, toucher « Morceau
    /// suivant ») : un navigateur qui tarde à annoncer son premier son ne gagne pas plus de temps.
    /// </summary>
    public static readonly TimeSpan MaxClockWait = TimeSpan.FromSeconds(30);

    /// <summary>La marge accordée au réseau après la fin du chrono : la réponse envoyée à zéro arrive un peu après.</summary>
    public static readonly TimeSpan ClockGrace = TimeSpan.FromSeconds(5);

    public short RoundsPassed { get; private set; }

    /// <summary>
    /// Le dernier palier dont l'offre est réglée (une carte prise, l'offre passée, ou la difficulté de la manche suivante choisie) : elle ne se
    /// rouvre pas. 0 au départ.
    /// </summary>
    public short OffersClosedThrough { get; private set; }

    public int TotalScore { get; private set; }

    public DateTimeOffset StartedAt { get; private set; }

    public DateTimeOffset? EndedAt { get; private set; }

    public IReadOnlyList<RunAnswer> Answers => _answers;

    /// <summary>La difficulté de chaque manche jouée ou en cours qui en propose plusieurs (choisie, ou « Sûre » notée à la première réponse sans choix).</summary>
    public IReadOnlyList<RunSessionRound> Rounds => _rounds;

    /// <summary>La position du morceau en cours : le premier sans réponse (N + 1 une fois tous répondus).</summary>
    public int NextPosition => _answers.Count + 1;

    public bool IsPending => Status == RunSessionStatus.Pending;

    /// <summary>Les coups de pouce de la partie : en main, lâchés ou joués (une ligne par carte reçue, dans l'ordre).</summary>
    public IReadOnlyList<RunSessionCard> Cards => _cards;

    /// <summary>La main : les cartes reçues, ni lâchées ni jouées.</summary>
    public IReadOnlyList<RunSessionCard> Hand => _cards.Where(c => c.InHand).OrderBy(c => c.Slot).ToList();

    /// <param name="rules">Les règles du défi : la carte offerte au départ du run, s'il y en a une, est mise en main.</param>
    public static RunSession Start(int challengeId, Guid playerId, DateTimeOffset now, RunRules? rules = null)
    {
        var session = new RunSession { ChallengeId = challengeId, PlayerId = playerId, Status = RunSessionStatus.Pending, CurrentPosition = 1, StartedAt = now };
        if (rules?.Cards?.StartCard is { } start)
            session._cards.Add(RunSessionCard.Create(1, start, 0, now));
        return session;
    }

    /// <summary>Ce morceau est-il celui qu'on peut jouer maintenant ? <paramref name="trackCount"/> est le nombre **réel** de morceaux du défi.</summary>
    public RunTrackTurn TurnOf(int position, int trackCount)
    {
        if (position < 1 || position > trackCount)
            return RunTrackTurn.Unknown;
        if (position < NextPosition)
            return RunTrackTurn.AlreadyAnswered;
        return position == NextPosition ? RunTrackTurn.Current : RunTrackTurn.NotYet;
    }

    /// <summary>La manche du morceau en cours ; vide une fois la partie finie.</summary>
    public int? CurrentRound(RunChallenge challenge)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        return IsPending ? challenge.Tracks.FirstOrDefault(t => t.Position == NextPosition)?.Round : null;
    }

    /// <summary>
    /// La difficulté de la manche <paramref name="round"/> : celle que le joueur a choisie, sinon « Sûre » (la manche d'une playlist du proto 1, la
    /// première manche, ou une manche jouée sans choix).
    /// </summary>
    public RunDifficultyOption OptionOf(RunChallenge challenge, int round)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        var chosen = _rounds.FirstOrDefault(r => r.Round == round);
        return (chosen is null ? null : challenge.Rules.OptionOf(round, chosen.Difficulty)) ?? challenge.Rules.DefaultOptionOf(round);
    }

    /// <summary>
    /// Le joueur peut encore choisir la difficulté de cette manche : c'est la manche en cours, elle propose un choix qu'il n'a pas fait, et rien n'y
    /// a commencé (aucune réponse, ni écoute ni chrono du morceau en cours). Choisir après avoir entendu le premier morceau serait tricher : son
    /// extrait n'est envoyé qu'après le choix (<c>RunPlayer.AdvanceAsync</c>).
    /// </summary>
    public bool CanChooseDifficulty(RunChallenge challenge, int round) =>
        CurrentRound(challenge) == round
        && challenge.Rules.HasChoice(round)
        && _rounds.TrueForAll(r => r.Round != round)
        && !RoundStarted(challenge, round);

    /// <summary>
    /// Quelque chose a commencé dans la manche en cours : une réponse (hors morceau neutralisé), une carte jouée, l'écoute ou le chrono du morceau
    /// en cours. Avant, le joueur est encore au palier : il choisit sa difficulté et prend une carte de l'offre.
    /// </summary>
    private bool RoundStarted(RunChallenge challenge, int round) =>
        _answers.Exists(a => !a.Neutralized && RoundAt(challenge, a.Position) == round)
        || _cards.Exists(c => c.PlayedRound == round)
        || CurrentClockAt is not null
        || RoundOfCurrentTrack().ListenedSeconds > 0;

    private static int RoundAt(RunChallenge challenge, int position) => challenge.Tracks.First(t => t.Position == position).Round;

    /// <summary>
    /// L'offre du palier, tant qu'elle est ouverte : la manche précédente est passée, la manche en cours n'a pas commencé, et l'offre n'est pas
    /// réglée (aucune carte prise, ni l'offre passée, ni la difficulté de la manche choisie). Tant qu'elle est ouverte, rien du premier morceau de
    /// la manche ne part (<c>RunPlayer.AdvanceAsync</c>) : on ne prend pas une carte en connaissant le morceau. Vide sinon.
    /// </summary>
    public RunCardOffer? OpenOffer(RunChallenge challenge)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (challenge.Rules.Cards is not { } cards || CurrentRound(challenge) is not { } round || round < 2)
            return null;
        var after = round - 1;
        var offer = cards.OfferAfter(after);
        // Une carte durable déjà en main ne se propose pas une seconde fois.
        if (cards.Durable)
            offer = offer.Where(c => !Hand.Any(h => h.Card == c)).ToList();
        if (offer.Count == 0 || after <= OffersClosedThrough || RoundStarted(challenge, round) || _cards.Exists(c => c.AcquiredRound == after))
            return null;
        return new RunCardOffer(after, offer);
    }

    /// <summary>« Passer » l'offre de ce palier : elle se ferme sans carte prise.</summary>
    public RunCardRefusal? CanPass(RunChallenge challenge, int afterRound) =>
        IsPending && OpenOffer(challenge) is { } offer && offer.AfterRound == afterRound ? null : RunCardRefusal.OfferClosed;

    public void PassOffer(RunChallenge challenge, int afterRound)
    {
        RequirePending();
        if (CanPass(challenge, afterRound) is not null)
            throw new InvalidOperationException("Aucune offre ouverte pour ce palier.");
        OffersClosedThrough = (short)afterRound;
    }

    /// <summary>
    /// Pourquoi cette carte de l'offre ne se prend pas, ou rien si elle le peut : l'offre de ce palier est ouverte et la propose, et, main pleine,
    /// <paramref name="dropSlot"/> désigne une carte de la main à lâcher en échange.
    /// </summary>
    public RunCardRefusal? CanTake(RunChallenge challenge, int afterRound, RunCard card, int? dropSlot)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (!IsPending || OpenOffer(challenge) is not { } offer || offer.AfterRound != afterRound || !offer.Cards.Contains(card))
            return RunCardRefusal.OfferClosed;
        var hand = Hand;
        if (hand.Count < challenge.Rules.Cards!.HandSize)
            return null;
        if (dropSlot is null)
            return RunCardRefusal.HandFull;
        return hand.Any(c => c.Slot == dropSlot) ? null : RunCardRefusal.NotInHand;
    }

    /// <summary>Prend une carte de l'offre du palier (<see cref="CanTake"/>) ; main pleine, la carte de <paramref name="dropSlot"/> est lâchée.</summary>
    public RunSessionCard TakeCard(RunChallenge challenge, int afterRound, RunCard card, int? dropSlot, DateTimeOffset now)
    {
        RequirePending();
        if (CanTake(challenge, afterRound, card, dropSlot) is { } refusal)
            throw new InvalidOperationException($"Cette carte ne se prend pas : {refusal}.");
        if (Hand.Count >= challenge.Rules.Cards!.HandSize)
            Hand.First(c => c.Slot == dropSlot).Drop(now, afterRound);

        var taken = RunSessionCard.Create((short)(_cards.Count + 1), card, (short)afterRound, now);
        _cards.Add(taken);
        OffersClosedThrough = (short)afterRound;
        return taken;
    }

    /// <summary>
    /// Pourquoi cette carte ne se lâche pas (elle n'est pas en main, ou, dans une playlist durable, aucun palier n'est ouvert : une carte durable
    /// ne se lâche qu'au palier, où ses effets sur les manches passées restent comptés), ou rien.
    /// </summary>
    public RunCardRefusal? CanDrop(RunChallenge challenge, int slot)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (!IsPending || Hand.All(c => c.Slot != slot))
            return RunCardRefusal.NotInHand;
        return challenge.Rules.Cards?.Durable == true && OpenOffer(challenge) is null ? RunCardRefusal.OfferClosed : null;
    }

    /// <summary>Lâche une carte de la main (elle ne revient pas dans cette partie, mais peut être offerte de nouveau à un palier suivant).</summary>
    public void DropCard(RunChallenge challenge, int slot, DateTimeOffset now)
    {
        RequirePending();
        if (CanDrop(challenge, slot) is { } refusal)
            throw new InvalidOperationException($"Cette carte ne se lâche pas : {refusal}.");
        Hand.First(c => c.Slot == slot).Drop(now, OpenOffer(challenge)?.AfterRound);
    }

    /// <summary>
    /// Pourquoi une carte de la main ne se joue pas maintenant sur le morceau en cours, ou rien si elle le peut. Une carte qui n'aurait rien à
    /// changer ne se gâche pas : Année sur un morceau sans année connue (<paramref name="yearKnown"/>), Sablier sans chrono ou une fois le chrono
    /// écoulé (il ne rachète pas une réponse en retard), Joker sans morceau en réserve dans la manche.
    /// </summary>
    /// <param name="choicesAvailable">« Trois choix » : le catalogue a deux leurres à proposer (sinon la carte ne montrerait que la réponse).</param>
    public RunCardRefusal? CanPlay(RunChallenge challenge, int slot, DateTimeOffset now, bool yearKnown = true, bool choicesAvailable = true)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (!IsPending || Hand.FirstOrDefault(c => c.Slot == slot) is not { } card)
            return RunCardRefusal.NotInHand;
        // Une carte durable agit toute seule : seule le Joker se joue.
        if (challenge.Rules.Cards?.Durable == true && card.Card != RunCard.Joker)
            return RunCardRefusal.Unavailable;
        var round = CurrentRound(challenge)!.Value;
        var active = card.Card == RunCard.LowerTarget
            ? _cards.Exists(c => c.Card == RunCard.LowerTarget && c.PlayedRound == round)
            : ActiveCardsAt(NextPosition).Contains(card.Card);
        if (active)
            return RunCardRefusal.AlreadyActive;
        return card.Card switch
        {
            RunCard.Joker when NextReserveTrack(challenge, round) is null => RunCardRefusal.Unavailable,
            RunCard.Year when !yearKnown => RunCardRefusal.Unavailable,
            RunCard.ThreeChoices when !choicesAvailable => RunCardRefusal.Unavailable,
            RunCard.Hourglass when !challenge.Rules.HasClock || IsLate(challenge.Rules, now) || ClockRemaining(challenge.Rules, now) == 0 =>
                RunCardRefusal.Unavailable,
            _ => null,
        };
    }

    /// <summary>
    /// Joue une carte de la main sur le morceau en cours. Le Joker remplace le morceau par le suivant de la réserve de sa manche : tout repart à zéro
    /// (écoute, envoi de l'extrait, chrono), les cartes déjà jouées sur l'ancien morceau sont perdues. « Trois choix » garde ses deux leurres
    /// (<paramref name="decoys"/>, tirés par l'application) : les mêmes à la reprise.
    /// </summary>
    public RunSessionCard PlayCard(
        RunChallenge challenge, int slot, DateTimeOffset now, bool yearKnown = true, IReadOnlyList<int>? decoys = null)
    {
        RequirePending();
        if (CanPlay(challenge, slot, now, yearKnown, decoys is null || decoys.Count == RunChoices.DecoyCount) is { } refusal)
            throw new InvalidOperationException($"Cette carte ne se joue pas : {refusal}.");
        var card = Hand.First(c => c.Slot == slot);
        var round = CurrentRound(challenge)!.Value;
        int? replacement = null;
        if (card.Card == RunCard.Joker)
        {
            replacement = NextReserveTrack(challenge, round);
            CurrentPosition = (short)NextPosition;
            CurrentListenedSeconds = null;
            CurrentServedAt = null;
            CurrentClockAt = null;
        }

        card.Play(
            (short)(_cards.Count(c => c.PlayOrder is not null) + 1), (short)NextPosition, (short)round, replacement,
            card.Card == RunCard.ThreeChoices ? [.. decoys ?? []] : null, now);
        return card;
    }

    /// <summary>
    /// Les cartes qui agissent sur le morceau en cours : dans une playlist durable, celles de la main (le Joker se joue une fois, il n'agit pas
    /// ensuite) ; sinon celles jouées sur ce morceau (<see cref="ActiveCardsAt(int)"/>).
    /// </summary>
    public IReadOnlyList<RunCard> ActiveCardsAt(RunRules rules, int position)
    {
        ArgumentNullException.ThrowIfNull(rules);
        return rules.Cards?.Durable == true
            ? Hand.Where(c => c.Card != RunCard.Joker).Select(c => c.Card).ToList()
            : ActiveCardsAt(position);
    }

    /// <summary>Les cartes jouées sur le morceau de cette position et toujours actives (celles d'avant un Joker sur ce morceau ne comptent plus).</summary>
    public IReadOnlyList<RunCard> ActiveCardsAt(int position)
    {
        var played = _cards.Where(c => c.PlayedPosition == position).OrderBy(c => c.PlayOrder).ToList();
        var lastJoker = played.FindLastIndex(c => c.Card == RunCard.Joker);
        return played.Skip(lastJoker + 1).Select(c => c.Card).ToList();
    }

    /// <summary>Le morceau joué à cette position : celui du défi, ou celui de la réserve qu'un Joker y a mis.</summary>
    public int TrackIdAt(RunChallenge challenge, int position)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        return _cards.Where(c => c.PlayedPosition == position && c.ReplacementTrackId is not null)
                   .OrderBy(c => c.PlayOrder).LastOrDefault()?.ReplacementTrackId
               ?? challenge.Tracks.First(t => t.Position == position).TrackId;
    }

    // Le prochain morceau de la réserve de la manche que cette partie n'a pas encore sorti.
    private int? NextReserveTrack(RunChallenge challenge, int round)
    {
        var used = _cards.Where(c => c.ReplacementTrackId is not null).Select(c => c.ReplacementTrackId!.Value).ToHashSet();
        return challenge.ReserveOf(round).Select(r => (int?)r.TrackId).FirstOrDefault(id => !used.Contains(id!.Value));
    }

    /// <summary>Les secondes que « Sablier » ajoute au chrono du morceau en cours (0 sans).</summary>
    public int ClockBonus(RunRules rules) =>
        rules.Cards is { } cards && ActiveCardsAt(rules, NextPosition).Contains(RunCard.Hourglass) ? cards.HourglassSeconds : 0;

    /// <summary>
    /// Le joueur choisit la difficulté de la manche en cours, avant son premier son. L'extrait du premier morceau de la manche part avec la réponse
    /// au choix : le chrono ne court qu'à partir de là, les écrans de palier et de difficulté ne mangent pas son temps.
    /// </summary>
    public void ChooseDifficulty(RunChallenge challenge, int round, RunDifficulty difficulty, DateTimeOffset now)
    {
        RequirePending();
        if (!CanChooseDifficulty(challenge, round))
            throw new InvalidOperationException("La difficulté de cette manche ne se choisit plus.");
        if (challenge.Rules.OptionOf(round, difficulty) is null)
            throw new ArgumentException("Cette difficulté n'est pas proposée pour cette manche.", nameof(difficulty));
        _rounds.Add(RunSessionRound.Create((short)round, difficulty, now));
        // Le choix fait partir l'extrait du premier morceau : l'offre du palier se ferme avec lui.
        OffersClosedThrough = (short)Math.Max(OffersClosedThrough, round - 1);
    }

    /// <summary>
    /// La durée d'écoute fixe du morceau en cours, à la difficulté de sa manche (la manche boss est plus courte), allongée par « Rallonge ».
    /// </summary>
    public decimal ListenSecondsOf(RunChallenge challenge)
    {
        if (CurrentRound(challenge) is not { } round)
            return challenge.Rules.ListenSeconds;
        var listen = OptionOf(challenge, round).ListenSeconds;
        if (challenge.Rules.Cards is not { } cards || !ActiveCardsAt(challenge.Rules, NextPosition).Contains(RunCard.Extend))
            return listen;
        return cards.Durable ? listen + cards.ExtendBonusSeconds : Math.Max(listen, cards.ExtendListenSeconds);
    }

    /// <summary>La manche Gameplay du morceau en cours, reconstituée de la partie (pas d'indice au proto 1).</summary>
    public TrackRound RoundOfCurrentTrack() =>
        CurrentPosition == NextPosition ? TrackRound.Resume(CurrentListenedSeconds ?? 0, 0) : TrackRound.Start;

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
        var left = (decimal)(start.AddSeconds(rules.AnswerSeconds + ClockBonus(rules)) - now).TotalSeconds;
        return Math.Max(0m, decimal.Round(left, 1));
    }

    /// <summary>La réponse arrive après le chrono (« Sablier » compris, marge réseau comprise) : elle ne rapporte rien.</summary>
    public bool IsLate(RunRules rules, DateTimeOffset now) =>
        ClockStart(rules) is { } start && now > start.AddSeconds(rules.AnswerSeconds + ClockBonus(rules)) + ClockGrace;

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
    /// morceau. Le verdict seul est gardé, jamais le texte saisi. Une réponse arrivée après le chrono (<see cref="IsLate"/>) compte comme un
    /// morceau passé : rien de juste, aucun point.
    /// </summary>
    public RunStep Answer(RunChallenge challenge, RoundOutcome outcome, IRunScoringPolicy scoring, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(outcome);
        ArgumentNullException.ThrowIfNull(scoring);
        var track = CurrentTrackOf(challenge);
        var late = IsLate(challenge.Rules, now);
        if (late)
            outcome = outcome with { ArtistCorrect = false, TitleCorrect = false };
        // Une manche à choix jouée sans choix (navigateur d'avant le proto 2) se joue en « Sûre », sans ligne : seul un vrai choix est noté.
        var option = OptionOf(challenge, track.Round);
        IReadOnlyList<RunCard> active = late ? [] : ActiveCardsAt(challenge.Rules, track.Position);
        var scale = option.Scale(track.Multiplier);
        var found = outcome.ArtistCorrect || outcome.TitleCorrect;
        int points;
        if (challenge.Rules.Cards?.Durable == true)
        {
            // « L'un ou l'autre » : un seul des deux suffit pour les points du morceau entier. « Repêchage » : un raté rapporte un quart (la moitié
            // de l'artiste seul). Les verdicts restent ceux de la réponse. Jamais une réponse en retard.
            points = found && active.Contains(RunCard.EitherOr)
                ? scoring.Points(outcome with { ArtistCorrect = true, TitleCorrect = true }, scale)
                : !found && active.Contains(RunCard.Net)
                    ? scoring.Points(outcome with { ArtistCorrect = true }, scale / 2)
                    : scoring.Points(outcome, scale);
        }
        else
        {
            // « Filet » (playlist d'avant) : un morceau raté rapporte comme à moitié trouvé.
            var scored = !found && active.Contains(RunCard.Net) ? outcome with { ArtistCorrect = true } : outcome;
            points = scoring.Points(scored, scale);
        }

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

    /// <summary>La manche <paramref name="round"/> de cette partie (score, objectif, maximum), à sa difficulté.</summary>
    public RoundProgress RoundProgressOf(RunChallenge challenge, int round, IRunScoringPolicy scoring) =>
        RoundProgressAt(challenge, round, OptionOf(challenge, round), scoring);

    /// <summary>
    /// Ce qui a manqué à une partie perdue : la manche ratée (celle qui suit les manches passées : la partie s'y arrête, une fois la manche finie) et les
    /// points qui manquaient à son objectif. Vide pour une partie gagnée, abandonnée ou en cours.
    /// </summary>
    public (int Round, int Points)? ShortfallOf(RunChallenge challenge, IRunScoringPolicy scoring)
    {
        if (Status != RunSessionStatus.Lost)
            return null;
        var round = RoundsPassed + 1;
        var progress = RoundProgressOf(challenge, round, scoring);
        return (round, progress.Objective - progress.Score);
    }

    /// <summary>
    /// La manche <paramref name="round"/> de cette partie si elle se jouait à cette difficulté : chaque colonne de l'écran « Difficulté ? ». Toute jauge
    /// passe par la partie, qui sait ce qui la modifie.
    /// </summary>
    public RoundProgress RoundProgressAt(RunChallenge challenge, int round, RunDifficultyOption option, IRunScoringPolicy scoring) =>
        RunGauge.Of(challenge, _answers, round, scoring, option, LoweredBy(challenge, round));

    /// <summary>La baisse de l'objectif de cette manche en pourcentage (« Seuil abaissé » joué dans la manche), 0 sinon.</summary>
    public int LoweredBy(RunChallenge challenge, int round)
    {
        ArgumentNullException.ThrowIfNull(challenge);
        if (challenge.Rules.Cards is not { } cards)
            return 0;
        // Durable : « Rabais » compte pour toutes les manches après sa prise, jusqu'au palier où il est lâché (les manches passées gardent leur objectif).
        var lowered = cards.Durable
            ? _cards.Exists(c => c.Card == RunCard.LowerTarget && c.AcquiredRound < round && (c.DroppedAfterRound is null || c.DroppedAfterRound >= round))
            : _cards.Exists(c => c.Card == RunCard.LowerTarget && c.PlayedRound == round);
        return lowered ? cards.LowerTargetPercent : 0;
    }

    private RunStep Record(RunChallenge challenge, RunAnswer answer, IRunScoringPolicy scoring, DateTimeOffset now)
    {
        var track = challenge.Tracks.First(t => t.Position == answer.Position);
        _answers.Add(answer);
        TotalScore += answer.Points;
        CurrentPosition = (short)NextPosition;
        CurrentListenedSeconds = null;
        CurrentServedAt = null;
        CurrentClockAt = null;

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

    /// <summary>Le morceau n'avait plus d'extrait : retiré du maximum de sa manche, par le serveur.</summary>
    public bool Neutralized { get; private set; }

    public DateTimeOffset AnsweredAt { get; private set; }

    public static RunAnswer Create(short position, bool artistCorrect, bool titleCorrect, int points, bool neutralized, DateTimeOffset now) =>
        new() { Position = position, ArtistCorrect = artistCorrect, TitleCorrect = titleCorrect, Points = points, Neutralized = neutralized, AnsweredAt = now };
}

/// <summary>Pourquoi une carte ne se joue pas sur le morceau en cours.</summary>
public enum RunCardRefusal
{
    /// <summary>Elle n'est pas (ou plus) dans la main.</summary>
    NotInHand,

    /// <summary>La même carte est déjà active sur ce morceau (ou sur la manche, pour « Seuil abaissé »).</summary>
    AlreadyActive,

    /// <summary>Son effet n'a rien à changer : plus de morceau en réserve pour le Joker, pas d'année, pas ou plus de chrono pour le Sablier.</summary>
    Unavailable,

    /// <summary>Pas d'offre ouverte pour ce palier, ou une carte qu'elle ne propose pas.</summary>
    OfferClosed,

    /// <summary>La main est pleine : prendre une carte demande d'en lâcher une.</summary>
    HandFull,
}

/// <summary>
/// Un coup de pouce reçu dans une partie : la carte de départ (manche 0) ou celle prise au palier d'une manche, puis lâchée ou jouée sur un morceau.
/// Une carte jouée par Joker garde le morceau de la réserve qu'elle a mis à la place.
/// </summary>
public sealed class RunSessionCard
{
    private RunSessionCard()
    {
    }

    public int SessionId { get; private set; }

    /// <summary>Son numéro dans la partie, à partir de 1, dans l'ordre où elle a été reçue.</summary>
    public short Slot { get; private set; }

    public RunCard Card { get; private set; }

    /// <summary>La manche après laquelle elle a été prise (0 : la carte offerte au départ).</summary>
    public short AcquiredRound { get; private set; }

    public DateTimeOffset AcquiredAt { get; private set; }

    public DateTimeOffset? DroppedAt { get; private set; }

    public DateTimeOffset? PlayedAt { get; private set; }

    /// <summary>Le morceau (sa position) sur lequel elle a été jouée.</summary>
    public short? PlayedPosition { get; private set; }

    /// <summary>La manche où elle a été jouée.</summary>
    public short? PlayedRound { get; private set; }

    /// <summary>Joker : le morceau de la réserve joué à la place.</summary>
    public int? ReplacementTrackId { get; private set; }

    /// <summary>Son rang parmi les cartes jouées de la partie (1, 2…) : l'ordre de jeu, sans dépendre de l'heure.</summary>
    public short? PlayOrder { get; private set; }

    /// <summary>« Trois choix » : les deux morceaux proposés à côté de la bonne réponse, figés quand la carte est jouée.</summary>
    public int[]? DecoyTrackIds { get; private set; }

    /// <summary>La carte durable lâchée à un palier : la dernière manche où elle agissait (celle qui précède l'offre où elle a été lâchée).</summary>
    public short? DroppedAfterRound { get; private set; }

    public bool InHand => DroppedAt is null && PlayedAt is null;

    public static RunSessionCard Create(short slot, RunCard card, short acquiredRound, DateTimeOffset now) =>
        new() { Slot = slot, Card = card, AcquiredRound = acquiredRound, AcquiredAt = now };

    internal void Drop(DateTimeOffset now, int? afterRound = null)
    {
        DroppedAt = now;
        DroppedAfterRound = (short?)afterRound;
    }

    internal void Play(short order, short position, short round, int? replacementTrackId, int[]? decoyTrackIds, DateTimeOffset now)
    {
        PlayOrder = order;
        DecoyTrackIds = decoyTrackIds;
        PlayedAt = now;
        PlayedPosition = position;
        PlayedRound = round;
        ReplacementTrackId = replacementTrackId;
    }
}

/// <summary>La difficulté d'une manche dans une partie (une ligne par manche à choix), choisie avant son premier son.</summary>
public sealed class RunSessionRound
{
    private RunSessionRound()
    {
    }

    public int SessionId { get; private set; }

    /// <summary>La manche, à partir de 1.</summary>
    public short Round { get; private set; }

    public RunDifficulty Difficulty { get; private set; }

    public DateTimeOffset ChosenAt { get; private set; }

    public static RunSessionRound Create(short round, RunDifficulty difficulty, DateTimeOffset now) =>
        new() { Round = round, Difficulty = difficulty, ChosenAt = now };
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
