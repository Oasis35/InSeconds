using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>
/// Les coups de pouce de la version simple : trois cartes qui se gagnent (une manche franchie à plus de 125 % de son objectif en offre une pour la
/// suivante, une seule à la fois, usée à la fin de cette manche) et l'Échange, offert à chaque manche sans se garder.
/// </summary>
public class RunSwapAndRewardTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 10, 8, 0, 0, TimeSpan.Zero);
    private static readonly IRunScoringPolicy Scoring = new ArtistTitleScoring();
    private static readonly RoundOutcome Found = new(true, true, 10m, 0);
    private static readonly RoundOutcome ArtistOnly = new(true, false, 10m, 0);
    private static readonly RoundOutcome Missed = new(false, false, 10m, 0);
    private static readonly RunCardDealer Dealer = new(new FisherYatesShuffle());

    private static RunChallenge Challenge(params RunCard[] pool)
    {
        var options = new RunsOptions { Cards = pool.Length == 0 ? null : [.. pool.Select(RunCards.KeyOf)] };
        var rules = options.ToRules();
        rules = rules with { Cards = Dealer.Deal(rules.Cards!, rules, seed: 11) };
        var tracks = Enumerable.Range(1, rules.TrackCount)
            .Select(id => new PlannedTrack(id, (id - 1) / rules.TracksPerRound + 1, rules.MultiplierOf((id - 1) / rules.TracksPerRound + 1)))
            .ToList();
        var reserve = Enumerable.Range(1, rules.Rounds)
            .SelectMany(round => new[] { new PlannedTrack(100 + round * 2, round, 1m), new PlannedTrack(101 + round * 2, round, 1m) })
            .ToList();
        return RunChallenge.Create("K7Q2M9", 11, rules, tracks, null, Now, reserve);
    }

    private static RunSession Start() => RunSession.Start(0, Guid.NewGuid(), Now);

    private static void PlayRound(RunSession session, RunChallenge challenge, RoundOutcome outcome, int count = 5)
    {
        for (var i = 0; i < count; i++)
            session.Answer(challenge, outcome, Scoring, Now);
    }

    [Fact]
    public void LesReglagesParDefaut_TroisCartes_EcartDeVingtCinqPourCent_ProlongationDeCinqSecondes()
    {
        var options = new RunsOptions();

        Assert.Equal(["three_choices", "hint", "extend"], options.EffectiveCards);
        var cards = options.ToRules().Cards!;
        Assert.Equal((25, 5m), (cards.RewardMarginPercent, cards.ExtendBonusSeconds));
        Assert.Equal([RunCard.ThreeChoices, RunCard.Hint, RunCard.Extend], cards.Pool);
    }

    [Fact]
    public void LesCartes_ParLeurNom_EtUneAncienneValeurSeLitSansPlanter()
    {
        Assert.Equal(RunCard.Hint, RunCards.Parse("hint"));
        Assert.Null(RunCards.Parse("joker"));
        Assert.Null(RunCards.Parse("swap"));
        Assert.Equal("swap", RunCards.KeyOf(RunCard.Swap));
        Assert.Equal(RunCards.RetiredKey, RunCards.KeyOf((RunCard)7));
    }

    [Fact]
    public void LeTirage_UneCarteParManche_SaufLaDerniere_ReproductibleEtDansLeLot()
    {
        var challenge = Challenge(RunCard.ThreeChoices, RunCard.Hint, RunCard.Extend);
        var again = Challenge(RunCard.ThreeChoices, RunCard.Hint, RunCard.Extend);

        var rewards = challenge.Rules.Cards!.Rewards!;
        Assert.Equal([1, 2, 3], rewards.Select(r => r.AfterRound));
        Assert.All(rewards, r => Assert.Contains(r.Card, challenge.Rules.Cards.Pool));
        Assert.Equal(rewards, again.Rules.Cards!.Rewards);
    }

    [Theory]
    [InlineData(112, 100, false)]
    [InlineData(125, 100, true)]
    [InlineData(300, 100, true)]
    [InlineData(10, 0, false)]
    public void LaCarteSeGagneAuDessusDeLEcart_JamaisSansObjectif(int score, int objective, bool earned) =>
        Assert.Equal(earned, new RunCardRules([RunCard.Hint], null, 25).Earns(score, objective));

    [Fact]
    public void UneMancheTresReussie_OffreLaCarte_QuiAideToutesLesMorceauxDeLaSuivante_PuisSUse()
    {
        var challenge = Challenge(RunCard.Hint);
        var session = Start();

        PlayRound(session, challenge, Found);

        Assert.Equal([RunCard.Hint], session.Hand.Select(c => c.Card));
        Assert.Empty(session.ActiveCardsAt(challenge, 5));
        Assert.Equal([RunCard.Hint], session.ActiveCardsAt(challenge, 6));
        Assert.Equal([RunCard.Hint], session.ActiveCardsAt(challenge, 10));

        PlayRound(session, challenge, Found);

        Assert.Equal(2, session.RoundsPassed);
        Assert.Equal([RunCard.Hint], session.Hand.Select(c => c.Card));
        Assert.Equal(2, session.Hand.Single().AcquiredRound);
        Assert.Single(session.Cards, c => c.AcquiredRound == 1 && c.DroppedAt is not null);
    }

    [Fact]
    public void UneMancheJusteFranchie_NOffreRien()
    {
        var challenge = Challenge(RunCard.Hint);
        var session = Start();

        // Artiste seul sur cinq morceaux : 250 points, l'objectif est 225 (45 % de 500), soit 111 % : passée, mais sans carte.
        PlayRound(session, challenge, ArtistOnly);

        Assert.Equal(1, session.RoundsPassed);
        Assert.Empty(session.Hand);
    }

    [Fact]
    public void UneMancheRatee_NOffreRien()
    {
        var challenge = Challenge(RunCard.Hint);
        var session = Start();

        PlayRound(session, challenge, Missed);

        Assert.Equal(RunSessionStatus.Lost, session.Status);
        Assert.Empty(session.Hand);
    }

    [Fact]
    public void UneSeuleCarteALaFois_LaNouvelleRemplaceCelleQuiVientDeServir()
    {
        var challenge = Challenge(RunCard.Extend);
        var session = Start();

        PlayRound(session, challenge, Found);
        PlayRound(session, challenge, Found);

        Assert.Equal(2, session.Hand.Single().AcquiredRound);
        Assert.Equal(2, session.Cards.Count(c => c.Card == RunCard.Extend));
        Assert.Single(session.Cards, c => c.DroppedAt is not null);
    }

    [Fact]
    public void Prolongation_AjouteCinqSecondesAToutesLesEcoutesDeLaManche()
    {
        var challenge = Challenge(RunCard.Extend);
        var session = Start();
        PlayRound(session, challenge, Found);
        session.ChooseDifficulty(challenge, 2, RunDifficulty.Safe, Now);

        Assert.Equal(15m, session.ListenSecondsOf(challenge));
        session.Answer(challenge, Found, Scoring, Now);
        Assert.Equal(15m, session.ListenSecondsOf(challenge));
    }

    [Fact]
    public void LEchange_ChangeLeMorceau_RemetToutAZero_EtNEstJamaisEnMain()
    {
        var challenge = Challenge(RunCard.Hint);
        var session = Start();
        session.KeepRound(TrackRound.Start.Listen(5m));
        session.ServeCurrent(Now);

        Assert.True(session.CanSwap(challenge));
        session.Swap(challenge, Now);

        Assert.Equal(102, session.TrackIdAt(challenge, 1));
        Assert.Null(session.CurrentListenedSeconds);
        Assert.Null(session.CurrentServedAt);
        Assert.Empty(session.Hand);
        Assert.Equal(1, session.SwapsIn(1));
    }

    [Fact]
    public void UnSeulEchangeParManche_QuiNeSeGardePas()
    {
        var challenge = Challenge(RunCard.Hint);
        var session = Start();
        session.Swap(challenge, Now);

        Assert.False(session.CanSwap(challenge));
        Assert.Throws<InvalidOperationException>(() => session.Swap(challenge, Now));

        // La manche suivante en offre un nouveau.
        PlayRound(session, challenge, Found);
        session.ChooseDifficulty(challenge, 2, RunDifficulty.Safe, Now);
        Assert.True(session.CanSwap(challenge));
        session.Swap(challenge, Now);
        Assert.Equal(104, session.TrackIdAt(challenge, 6));
    }

    [Fact]
    public void LEchange_NeSePropose_PasTantQueLaDifficulteResteAChoisir_NiSansReserve()
    {
        var challenge = Challenge(RunCard.Hint);
        var session = Start();
        PlayRound(session, challenge, Found);

        Assert.False(session.CanSwap(challenge));
        session.ChooseDifficulty(challenge, 2, RunDifficulty.Safe, Now);
        Assert.True(session.CanSwap(challenge));

        var noReserve = RunChallenge.Create("K7Q2M8", 11, challenge.Rules with { ReservePerRound = 0 }, challenge.Tracks
            .Select(t => new PlannedTrack(t.TrackId, t.Round, t.Multiplier)).ToList(), null, Now);
        Assert.False(Start().CanSwap(noReserve));
    }

    [Fact]
    public void LaCarteGagnee_AideLeMorceauEchange_CommeLesAutres()
    {
        var challenge = Challenge(RunCard.Hint);
        var session = Start();
        PlayRound(session, challenge, Found);
        session.ChooseDifficulty(challenge, 2, RunDifficulty.Safe, Now);

        session.Swap(challenge, Now);

        Assert.Equal([RunCard.Hint], session.ActiveCardsAt(challenge, 6));
        Assert.Single(session.Hand);
    }
}
