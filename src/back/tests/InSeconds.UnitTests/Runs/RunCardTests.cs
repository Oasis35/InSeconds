using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>
/// Les coups de pouce : tirage de la carte de départ et des offres (les mêmes pour tous les joueurs d'une playlist), main de deux, offre d'un palier,
/// et l'effet de chaque carte jouée sur le morceau en cours (écoute, chrono, points, objectif, Joker).
/// </summary>
public class RunCardTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 5, 8, 0, 0, TimeSpan.Zero);
    private static readonly IRunScoringPolicy Scoring = new ArtistTitleScoring();
    private static readonly RoundOutcome Found = new(true, true, 10m, 0);
    private static readonly RoundOutcome Missed = new(false, false, 10m, 0);
    private static readonly RunCardDealer Dealer = new(new FisherYatesShuffle());

    /// <summary>Des règles par défaut dont les cartes sont tirées dans <paramref name="pool"/>, avec 2 morceaux de réserve par manche.</summary>
    private static RunChallenge Challenge(params RunCard[] pool)
    {
        var options = new RunsOptions { Cards = pool.Length == 0 ? null : [.. pool.Select(RunCards.KeyOf)] };
        var rules = options.ToRules();
        rules = rules with { Cards = Dealer.Deal(rules.Cards!, rules, seed: 11) };
        var tracks = Enumerable.Range(1, rules.TrackCount)
            .Select(id => new PlannedTrack(id, (id - 1) / rules.TracksPerRound + 1, rules.MultiplierOf((id - 1) / rules.TracksPerRound + 1)))
            .ToList();
        var reserve = Enumerable.Range(1, rules.Rounds).SelectMany(round => new[] { new PlannedTrack(100 + round * 2, round, 1m), new PlannedTrack(101 + round * 2, round, 1m) })
            .ToList();
        return RunChallenge.Create("K7Q2M9", 11, rules, tracks, null, Now, reserve);
    }

    private static RunSession Start(RunChallenge challenge) => RunSession.Start(0, Guid.NewGuid(), Now, challenge.Rules);

    private static RunSession InRoundTwo(RunChallenge challenge)
    {
        var session = Start(challenge);
        for (var i = 0; i < 5; i++)
            session.Answer(challenge, Found, Scoring, Now);
        return session;
    }

    [Fact]
    public void LeTirage_UneCarteDeDepart_TroisCartesDistinctesParPalier_ReproductiblePourLaGraine()
    {
        var rules = new RunsOptions().ToRules();

        var dealt = Dealer.Deal(rules.Cards!, rules, seed: 42);

        Assert.NotNull(dealt.StartCard);
        Assert.Equal([1, 2, 3], dealt.Offers.Select(o => o.AfterRound));
        Assert.All(dealt.Offers, o => Assert.Equal(3, o.Cards.Distinct().Count()));
        var again = Dealer.Deal(rules.Cards!, rules, seed: 42);
        Assert.Equal(dealt.StartCard, again.StartCard);
        Assert.Equal(dealt.Offers.Select(o => o.Cards), again.Offers.Select(o => o.Cards));
        Assert.Equal((2, 20m, 30, 20), (dealt.HandSize, dealt.ExtendListenSeconds, dealt.HourglassSeconds, dealt.LowerTargetPercent));
    }

    [Fact]
    public void SansReserve_LeJokerNEstJamaisTire()
    {
        var rules = new RunsOptions { ReservePerRound = 0, Cards = ["joker", "year"] }.ToRules();

        var dealt = Dealer.Deal(rules.Cards!, rules, seed: 3);

        Assert.Equal(RunCard.Year, dealt.StartCard);
        Assert.All(dealt.Offers, o => Assert.Equal([RunCard.Year], o.Cards));
    }

    [Fact]
    public void SansCarte_NiCarteDeDepartNiOffre()
    {
        var rules = new RunsOptions { Cards = [] }.ToRules();

        Assert.Null(rules.Cards);
        var session = RunSession.Start(0, Guid.NewGuid(), Now, rules);
        Assert.Empty(session.Hand);
    }

    [Fact]
    public void LaCarteDeDepart_EstEnMainAuDebut()
    {
        var challenge = Challenge(RunCard.Year);

        var session = Start(challenge);

        var card = Assert.Single(session.Hand);
        Assert.Equal((RunCard.Year, (short)0, (short)1), (card.Card, card.AcquiredRound, card.Slot));
        Assert.Null(session.OpenOffer(challenge));
    }

    [Fact]
    public void LOffre_SOuvreAuPalier_SePrendUneFois_EtSeFermeQuandLaMancheCommence()
    {
        var challenge = Challenge(RunCard.Year, RunCard.Net, RunCard.Extend);
        var session = InRoundTwo(challenge);

        var offer = session.OpenOffer(challenge)!;
        Assert.Equal(1, offer.AfterRound);
        Assert.Equal(3, offer.Cards.Count);

        session.TakeCard(challenge, offer.Cards[0], dropSlot: null, Now);
        Assert.Equal(2, session.Hand.Count);
        Assert.Null(session.OpenOffer(challenge));

        // Passer l'offre, c'est commencer la manche : elle se ferme au premier son.
        var other = InRoundTwo(challenge);
        other.KeepRound(other.RoundOfCurrentTrack().Listen(2m));
        Assert.Null(other.OpenOffer(challenge));
    }

    [Fact]
    public void MainPleine_PrendreDemandeDeLacherUneCarte()
    {
        var challenge = Challenge(RunCard.Year, RunCard.Net, RunCard.Extend);
        var session = InRoundTwo(challenge);
        session.TakeCard(challenge, session.OpenOffer(challenge)!.Cards[0], null, Now);
        for (var i = 0; i < 5; i++)
            session.Answer(challenge, Found, Scoring, Now);
        var offer = session.OpenOffer(challenge)!;

        Assert.Throws<InvalidOperationException>(() => session.TakeCard(challenge, offer.Cards[1], dropSlot: null, Now));
        session.TakeCard(challenge, offer.Cards[1], dropSlot: 1, Now);

        Assert.Equal([2, 3], session.Hand.Select(c => (int)c.Slot));
        Assert.NotNull(session.Cards.Single(c => c.Slot == 1).DroppedAt);
    }

    [Fact]
    public void UneCarteLachee_NeRevientPas()
    {
        var challenge = Challenge(RunCard.Year);
        var session = Start(challenge);

        session.DropCard(1, Now);

        Assert.Empty(session.Hand);
        Assert.Equal(RunCardRefusal.NotInHand, session.CanPlay(challenge, 1));
        Assert.Throws<InvalidOperationException>(() => session.DropCard(1, Now));
    }

    [Fact]
    public void Rallonge_AllongeLEcouteDuMorceauEnCoursSeulement()
    {
        var challenge = Challenge(RunCard.Extend);
        var session = Start(challenge);

        session.PlayCard(challenge, 1, Now);

        Assert.Equal(20m, session.ListenSecondsOf(challenge));
        Assert.Equal([RunCard.Extend], session.ActiveCardsAt(1));
        session.Answer(challenge, Found, Scoring, Now);
        Assert.Equal(10m, session.ListenSecondsOf(challenge));
    }

    [Fact]
    public void Sablier_AjouteSonTempsAuChrono()
    {
        var challenge = Challenge(RunCard.Hourglass);
        var session = Start(challenge);
        session.ServeCurrent(Now);
        session.StartClock(Now);

        session.PlayCard(challenge, 1, Now);

        Assert.Equal(75m, session.ClockRemaining(challenge.Rules, Now));
        Assert.False(session.IsLate(challenge.Rules, Now.AddSeconds(70)));
    }

    [Fact]
    public void Filet_UnMorceauRateRapporteCommeAMoitieTrouve_SansChangerLesVerdicts()
    {
        var challenge = Challenge(RunCard.Net);
        var session = Start(challenge);

        session.PlayCard(challenge, 1, Now);
        session.Answer(challenge, Missed, Scoring, Now);

        var answer = Assert.Single(session.Answers);
        Assert.Equal((50, false, false), (answer.Points, answer.ArtistCorrect, answer.TitleCorrect));
    }

    [Fact]
    public void Filet_SansEffetSurUnMorceauTrouve()
    {
        var challenge = Challenge(RunCard.Net);
        var session = Start(challenge);

        session.PlayCard(challenge, 1, Now);
        session.Answer(challenge, Found, Scoring, Now);

        Assert.Equal(100, session.Answers[0].Points);
    }

    [Fact]
    public void SeuilAbaisse_LObjectifDeLaMancheBaisseDeVingtPourCent_UneFoisParManche()
    {
        var challenge = Challenge(RunCard.LowerTarget);
        var session = Start(challenge);
        Assert.Equal(225, session.RoundProgressOf(challenge, 1, Scoring).Objective);

        session.PlayCard(challenge, 1, Now);

        Assert.Equal(180, session.RoundProgressOf(challenge, 1, Scoring).Objective);
        Assert.Equal(366, session.RoundProgressOf(challenge, 2, Scoring).Objective);
    }

    [Fact]
    public void Joker_RemplaceLeMorceauParLaReserveDeLaManche_EtRemetToutAZero()
    {
        var challenge = Challenge(RunCard.Joker);
        var session = Start(challenge);
        session.ServeCurrent(Now);
        session.StartClock(Now);
        session.KeepRound(session.RoundOfCurrentTrack().Listen(10m));

        session.PlayCard(challenge, 1, Now);

        Assert.Equal(102, session.TrackIdAt(challenge, 1));
        Assert.Equal(2, session.TrackIdAt(challenge, 2));
        Assert.Equal((null, null, (decimal?)null), (session.CurrentServedAt, session.CurrentClockAt, session.CurrentListenedSeconds));
        Assert.Empty(session.ActiveCardsAt(1));
    }

    [Fact]
    public void LesCartesJoueesAvantUnJoker_NeComptentPlusSurLeNouveauMorceau()
    {
        var challenge = Challenge(RunCard.Joker, RunCard.Year);
        var session = Start(challenge);
        var start = session.Hand.Single().Card;
        var other = start == RunCard.Joker ? RunCard.Year : RunCard.Joker;
        for (var i = 0; i < 5; i++)
            session.Answer(challenge, Found, Scoring, Now);
        session.TakeCard(challenge, other, null, Now);

        var year = session.Hand.Single(c => c.Card == RunCard.Year).Slot;
        var joker = session.Hand.Single(c => c.Card == RunCard.Joker).Slot;
        session.PlayCard(challenge, year, Now);
        session.PlayCard(challenge, joker, Now);

        Assert.Empty(session.ActiveCardsAt(6));
        Assert.Equal(104, session.TrackIdAt(challenge, 6));
    }

    [Fact]
    public void LaMemeCarte_UneSeuleFoisParMorceau()
    {
        var challenge = Challenge(RunCard.Year);
        var session = InRoundTwo(challenge);
        session.TakeCard(challenge, RunCard.Year, null, Now);

        session.PlayCard(challenge, 1, Now);

        Assert.Equal(RunCardRefusal.AlreadyActive, session.CanPlay(challenge, 2));
        Assert.Throws<InvalidOperationException>(() => session.PlayCard(challenge, 2, Now));
    }

    [Fact]
    public void JokerSansReserve_OuSablierSansChrono_NeSeJouentPas()
    {
        var challenge = Challenge(RunCard.Joker);
        var session = Start(challenge);
        // La réserve de la manche 1 compte deux morceaux : le troisième Joker n'a plus rien à sortir.
        var noReserve = RunChallenge.Create(
            "K7Q2M9", 11, challenge.Rules, challenge.Tracks.Select(t => new PlannedTrack(t.TrackId, t.Round, t.Multiplier)).ToList(), null, Now);
        Assert.Equal(RunCardRefusal.Unavailable, RunSession.Start(0, Guid.NewGuid(), Now, noReserve.Rules).CanPlay(noReserve, 1));

        var hourglass = Challenge(RunCard.Hourglass);
        var noClock = RunChallenge.Create(
            "K7Q2M9", 11, hourglass.Rules with { AnswerSeconds = 0 },
            hourglass.Tracks.Select(t => new PlannedTrack(t.TrackId, t.Round, t.Multiplier)).ToList(), null, Now);
        Assert.Equal(RunCardRefusal.Unavailable, RunSession.Start(0, Guid.NewGuid(), Now, noClock.Rules).CanPlay(noClock, 1));
        Assert.Null(session.CanPlay(challenge, 1));
    }

    [Fact]
    public void JouerUneCarte_FermeLeChoixDeDifficulteEtLOffre()
    {
        var challenge = Challenge(RunCard.Year, RunCard.Net, RunCard.Extend);
        var session = InRoundTwo(challenge);
        session.TakeCard(challenge, session.OpenOffer(challenge)!.Cards[0], null, Now);
        Assert.True(session.CanChooseDifficulty(challenge, 2));

        session.PlayCard(challenge, session.Hand[0].Slot, Now);

        Assert.False(session.CanChooseDifficulty(challenge, 2));
    }

    [Fact]
    public void LesInitiales_PremiereLettreOuChiffreDeChaqueMot()
    {
        Assert.Equal(["D", "P"], RunInitials.Of("Daft Punk"));
        Assert.Equal(["O", "M", "T"], RunInitials.Of("one more time"));
        Assert.Equal(["5", "S", "O", "S"], RunInitials.Of("5 Seconds of Summer"));
        Assert.Equal(["É"], RunInitials.Of("  (Été)  "));
    }

    [Fact]
    public void LesReglages_DesCartesInconnuesOuDesEffetsHorsBornes_SontRefuses()
    {
        Assert.Contains(RunsOptionsChecks.Problems(new RunsOptions { Cards = ["year", "magic"] }), p => p.StartsWith("Runs:Cards", StringComparison.Ordinal));
        Assert.Contains(RunsOptionsChecks.Problems(new RunsOptions { HandSize = 0 }), p => p.StartsWith("Runs:HandSize", StringComparison.Ordinal));
        Assert.Contains(RunsOptionsChecks.Problems(new RunsOptions { ExtendListenSeconds = 31 }), p => p.StartsWith("Runs:ExtendListenSeconds", StringComparison.Ordinal));
        Assert.Contains(RunsOptionsChecks.Problems(new RunsOptions { LowerTargetPercent = 95 }), p => p.StartsWith("Runs:LowerTargetPercent", StringComparison.Ordinal));
        Assert.Empty(RunsOptionsChecks.Problems(new RunsOptions { Cards = [] }));
    }
}
