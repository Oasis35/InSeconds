using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>
/// Les cartes durables : rien en main au départ, une carte agit tant qu'on la garde (sans clic), le Joker seul se joue, et ce que valent
/// Rabais, Prolongation, Délai, Repêchage et L'un ou l'autre. Les playlists d'avant gardent leur comportement (<see cref="RunCardTests"/>).
/// </summary>
public class RunDurableCardTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 9, 8, 0, 0, TimeSpan.Zero);
    private static readonly IRunScoringPolicy Scoring = new ArtistTitleScoring();
    private static readonly RoundOutcome Found = new(true, true, 10m, 0);
    private static readonly RoundOutcome ArtistOnly = new(true, false, 10m, 0);
    private static readonly RoundOutcome Missed = new(false, false, 10m, 0);
    private static readonly RunCardDealer Dealer = new(new FisherYatesShuffle());
    private static readonly int[] AllRounds = [1, 2, 3, 4];

    private static RunChallenge Challenge(params RunCard[] pool)
    {
        var options = new RunsOptions { Cards = pool.Length == 0 ? null : [.. pool.Select(RunCards.KeyOf)] };
        var rules = options.ToRules();
        rules = rules with { Cards = Dealer.Deal(rules.Cards!, rules, seed: 11, AllRounds) };
        var tracks = Enumerable.Range(1, rules.TrackCount)
            .Select(id => new PlannedTrack(id, (id - 1) / rules.TracksPerRound + 1, rules.MultiplierOf((id - 1) / rules.TracksPerRound + 1)))
            .ToList();
        var reserve = Enumerable.Range(1, rules.Rounds).SelectMany(round => new[] { new PlannedTrack(100 + round * 2, round, 1m), new PlannedTrack(101 + round * 2, round, 1m) })
            .ToList();
        return RunChallenge.Create("K7Q2M9", 11, rules, tracks, null, Now, reserve);
    }

    private static RunSession Start(RunChallenge challenge) => RunSession.Start(0, Guid.NewGuid(), Now, challenge.Rules);

    /// <summary>Une partie au palier de la manche 2, ayant pris <paramref name="card"/> à l'offre (qui la propose forcément : une seule carte possible).</summary>
    private static RunSession HoldingAtRoundTwo(RunChallenge challenge, params RunCard[] cards)
    {
        var session = Start(challenge);
        for (var i = 0; i < 5; i++)
            session.Answer(challenge, Found, Scoring, Now);
        foreach (var card in cards)
            session.TakeCard(challenge, 1, card, session.Hand.Count >= 2 ? session.Hand[0].Slot : null, Now);
        return session;
    }

    [Fact]
    public void LesNouveauxReglages_CartesDurables_SansCarteDeDepart_PremiereMancheNue()
    {
        var challenge = Challenge(RunCard.Year, RunCard.Genre, RunCard.Net);

        Assert.True(challenge.Rules.Cards!.Durable);
        Assert.Null(challenge.Rules.Cards.StartCard);
        var session = Start(challenge);
        Assert.Empty(session.Hand);
        Assert.Empty(session.ActiveCardsAt(challenge.Rules, 1));
        Assert.Equal(3, challenge.Rules.Cards.Offers[0].Cards.Count);
    }

    [Fact]
    public void LesValeursParDefaut_RabaisDixPourCent_ProlongationCinqSecondes_DelaiQuinzeSecondes_Seuils()
    {
        var options = new RunsOptions();

        Assert.Equal([45, 55, 68, 80], options.EffectiveThresholdPercents);
        var cards = options.ToRules().Cards!;
        Assert.Equal((10, 5m, 15, options.ListenSeconds + 5m), (cards.LowerTargetPercent, cards.ExtendBonusSeconds, cards.HourglassSeconds, cards.ExtendListenSeconds));
        Assert.Equal(10, RunCards.All.Count);
    }

    [Fact]
    public void UneCarteEnMain_AgitSansEtreJouee_EtTantQuOnLaGarde()
    {
        var challenge = Challenge(RunCard.Year);
        var session = HoldingAtRoundTwo(challenge, RunCard.Year);

        Assert.Equal([RunCard.Year], session.ActiveCardsAt(challenge.Rules, 6));
        session.Answer(challenge, Found, Scoring, Now);
        Assert.Equal([RunCard.Year], session.ActiveCardsAt(challenge.Rules, 7));
        Assert.Equal(RunCardRefusal.Unavailable, session.CanPlay(challenge, 1, Now));
    }

    [Fact]
    public void UneCarteDejaEnMain_NeSeReproposePas()
    {
        var challenge = Challenge(RunCard.Year, RunCard.Genre, RunCard.Extend, RunCard.Net);
        var first = HoldingAtRoundTwo(challenge, challenge.Rules.Cards!.Offers[0].Cards[0]);
        for (var i = 0; i < 5; i++)
            first.Answer(challenge, Found, Scoring, Now);

        var offer = first.OpenOffer(challenge);

        Assert.NotNull(offer);
        Assert.DoesNotContain(first.Hand[0].Card, offer.Cards);
    }

    [Fact]
    public void LeJoker_SeulSeJoue_ChangeLeMorceau_EtLaisseLaPlace()
    {
        var challenge = Challenge(RunCard.Joker);
        var session = HoldingAtRoundTwo(challenge, RunCard.Joker);

        Assert.Null(session.CanPlay(challenge, session.Hand[0].Slot, Now));
        session.PlayCard(challenge, session.Hand[0].Slot, Now);

        Assert.Empty(session.Hand);
        Assert.Equal(100 + 2 * 2, session.TrackIdAt(challenge, 6));
        Assert.Empty(session.ActiveCardsAt(challenge.Rules, 6));
    }

    [Fact]
    public void Prolongation_AjouteCinqSecondesAChaqueMorceau_LaMancheBossComprise()
    {
        var challenge = Challenge(RunCard.Extend);
        var session = HoldingAtRoundTwo(challenge, RunCard.Extend);

        Assert.Equal(session.OptionOf(challenge, 2).ListenSeconds + 5m, session.ListenSecondsOf(challenge));
        for (var i = 0; i < 4; i++)
            session.Answer(challenge, Found, Scoring, Now);
        Assert.Equal(session.OptionOf(challenge, 2).ListenSeconds + 5m, session.ListenSecondsOf(challenge));
    }

    [Fact]
    public void Delai_AjouteQuinzeSecondesAuChronoDuMorceau()
    {
        var challenge = Challenge(RunCard.Hourglass);
        var session = HoldingAtRoundTwo(challenge, RunCard.Hourglass);
        session.ServeCurrent(Now);
        session.StartClock(Now);

        Assert.Equal(15, session.ClockBonus(challenge.Rules));
        Assert.Equal(challenge.Rules.AnswerSeconds + 15m, session.ClockRemaining(challenge.Rules, Now));
    }

    [Fact]
    public void Repechage_UnRateRapporteUnQuart_DesPointsDuMorceau()
    {
        var challenge = Challenge(RunCard.Net);
        var plain = HoldingAtRoundTwo(challenge);
        var held = HoldingAtRoundTwo(challenge, RunCard.Net);
        var scale = held.OptionOf(challenge, 2).Scale(challenge.Rules.MultiplierOf(2));

        plain.Answer(challenge, Missed, Scoring, Now);
        held.Answer(challenge, Missed, Scoring, Now);

        Assert.Equal(0, plain.Answers.Last().Points);
        Assert.Equal(Scoring.Points(Found with { TitleCorrect = false }, scale / 2), held.Answers.Last().Points);
        Assert.False(held.Answers.Last().ArtistCorrect);
    }

    [Fact]
    public void LUnOuLAutre_UnSeulDesDeuxSuffitPourLeMorceauEntier_MaisRienDeTrouveRapporteZero()
    {
        var challenge = Challenge(RunCard.EitherOr);
        var held = HoldingAtRoundTwo(challenge, RunCard.EitherOr);
        var plain = HoldingAtRoundTwo(challenge);
        var scale = held.OptionOf(challenge, 2).Scale(challenge.Rules.MultiplierOf(2));

        held.Answer(challenge, ArtistOnly, Scoring, Now);
        plain.Answer(challenge, ArtistOnly, Scoring, Now);
        held.Answer(challenge, Missed, Scoring, Now);

        Assert.Equal(Scoring.Points(Found, scale), held.Answers.First(a => a.Position == 6).Points);
        Assert.Equal(Scoring.Points(ArtistOnly, scale), plain.Answers.Last().Points);
        Assert.Equal(0, held.Answers.First(a => a.Position == 7).Points);
    }

    [Fact]
    public void RepechageEtLUnOuLAutre_SeCumulent()
    {
        var challenge = Challenge(RunCard.Net, RunCard.EitherOr);
        var session = HoldingAtRoundTwo(challenge, RunCard.Net);
        for (var i = 0; i < 5; i++)
            session.Answer(challenge, Found, Scoring, Now);
        session.TakeCard(challenge, 2, RunCard.EitherOr, null, Now);
        var scale = session.OptionOf(challenge, 3).Scale(challenge.Rules.MultiplierOf(3));

        session.Answer(challenge, ArtistOnly, Scoring, Now);
        session.Answer(challenge, Missed, Scoring, Now);

        Assert.Equal(Scoring.Points(Found, scale), session.Answers.First(a => a.Position == 11).Points);
        Assert.Equal(Scoring.Points(Found with { TitleCorrect = false }, scale / 2), session.Answers.First(a => a.Position == 12).Points);
    }

    [Fact]
    public void Rabais_BaisseLObjectifDesManchesSuivantes_MaisPasCeluiDesManchesPassees()
    {
        var challenge = Challenge(RunCard.LowerTarget);
        var plain = HoldingAtRoundTwo(challenge);
        var held = HoldingAtRoundTwo(challenge, RunCard.LowerTarget);

        Assert.Equal(0, held.LoweredBy(challenge, 1));
        Assert.Equal(10, held.LoweredBy(challenge, 2));
        Assert.Equal(10, held.LoweredBy(challenge, 3));
        Assert.Equal(0, plain.LoweredBy(challenge, 2));
        Assert.True(held.RoundProgressOf(challenge, 2, Scoring).Objective < plain.RoundProgressOf(challenge, 2, Scoring).Objective);
    }

    [Fact]
    public void UnRabaisLacheAuPalier_GardeSonEffetSurLesManchesDejaJouees()
    {
        var challenge = Challenge(RunCard.LowerTarget, RunCard.Year, RunCard.Genre);
        var session = HoldingAtRoundTwo(challenge, RunCard.LowerTarget);
        for (var i = 0; i < 5; i++)
            session.Answer(challenge, Found, Scoring, Now);

        session.DropCard(challenge, session.Hand.Single().Slot, Now);
        var offer = session.OpenOffer(challenge);
        Assert.NotNull(offer);
        session.TakeCard(challenge, 2, offer.Cards[0], null, Now);

        Assert.Equal(10, session.LoweredBy(challenge, 2));
        Assert.Equal(0, session.LoweredBy(challenge, 3));
    }

    [Fact]
    public void UneCarteDurableNeSeLacheQuAuPalier()
    {
        var challenge = Challenge(RunCard.Year);
        var session = HoldingAtRoundTwo(challenge, RunCard.Year);
        session.KeepRound(session.RoundOfCurrentTrack().Listen(2m));

        Assert.Equal(RunCardRefusal.OfferClosed, session.CanDrop(challenge, session.Hand[0].Slot));
        Assert.Throws<InvalidOperationException>(() => session.DropCard(challenge, session.Hand[0].Slot, Now));
    }

    [Fact]
    public void LesCartesDurablesAjoutees_SontConnues_EtLeJokerSeulAnUsageUnique()
    {
        Assert.Equal("genre", RunCards.KeyOf(RunCard.Genre));
        Assert.Equal("either_or", RunCards.KeyOf(RunCard.EitherOr));
        Assert.Equal(RunCard.EitherOr, RunCards.Parse("either_or"));
    }

    [Fact]
    public void UnePlaylistDAvant_SansLeDrapeauDurable_GardeSonComportement()
    {
        var legacyJson = System.Text.Json.JsonSerializer.Serialize(new RunCardRules(2, RunCard.Year, [], 20m, 30, 20, [RunCard.Year]));
        var stripped = System.Text.Json.JsonDocument.Parse(legacyJson).RootElement.EnumerateObject()
            .Where(p => p.Name is not ("Durable" or "ExtendBonusSeconds"))
            .ToDictionary(p => p.Name, p => p.Value);

        var read = System.Text.Json.JsonSerializer.Deserialize<RunCardRules>(System.Text.Json.JsonSerializer.Serialize(stripped));

        Assert.NotNull(read);
        Assert.False(read.Durable);
        Assert.Equal(0m, read.ExtendBonusSeconds);
    }
}
