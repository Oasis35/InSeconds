using System.Text.Json;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>
/// Le proto 2 : les difficultés de chaque manche figées dans la playlist (objectif, facteur de points, écoute de la manche boss), le choix fait
/// dans la partie avant le premier son de la manche, la réserve du Joker, et les playlists du proto 1 qui se jouent comme avant.
/// </summary>
public class RunDifficultyTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 5, 8, 0, 0, TimeSpan.Zero);
    private static readonly IRunScoringPolicy Scoring = new ArtistTitleScoring();
    private static readonly RoundOutcome Found = new(true, true, 10m, 0);
    private static readonly RoundOutcome Missed = new(false, false, 10m, 0);
    private static readonly RunRules Rules = RunsOptions.DefaultRules();

    private static RunChallenge Challenge(RunRules? rules = null)
    {
        rules ??= Rules;
        var tracks = Enumerable.Range(1, rules.TrackCount)
            .Select(id => new PlannedTrack(id, (id - 1) / rules.TracksPerRound + 1, rules.MultiplierOf((id - 1) / rules.TracksPerRound + 1)))
            .ToList();
        return RunChallenge.Create("K7Q2M9", 1, rules, tracks, null, Now);
    }

    /// <summary>Une partie dont la manche 1 est passée (5 morceaux trouvés) : la manche 2, à choisir, est en cours.</summary>
    private static RunSession InRoundTwo(RunChallenge challenge)
    {
        var session = RunSession.Start(0, Guid.NewGuid(), Now);
        for (var i = 0; i < 5; i++)
            session.Answer(challenge, Found, Scoring, Now);
        return session;
    }

    [Fact]
    public void LesReglesParDefaut_PremiereMancheSansChoix_PuisTroisDifficultes()
    {
        Assert.Equal([RunDifficulty.Safe], Rules.OptionsOf(1).Select(o => o.Difficulty));
        Assert.False(Rules.HasChoice(1));
        foreach (var round in new[] { 2, 3, 4 })
        {
            Assert.True(Rules.HasChoice(round));
            Assert.Equal([RunDifficulty.Easy, RunDifficulty.Safe, RunDifficulty.Risky], Rules.OptionsOf(round).Select(o => o.Difficulty));
        }

        // Manche 2 (seuil 55 %) : Facile 60 % du seuil, Sûre le seuil, Risquée 150 %.
        Assert.Equal(
            [new(RunDifficulty.Easy, 0.67m, 33, 10m), new(RunDifficulty.Safe, 1m, 55, 10m), new RunDifficultyOption(RunDifficulty.Risky, 1.33m, 83, 10m)],
            Rules.OptionsOf(2));
        Assert.Equal(45, Rules.OptionsOf(1).Single().ObjectivePercent);
    }

    [Fact]
    public void LaMancheBoss_LaDerniereEnRisquee_EcouteRaccourcie()
    {
        Assert.Equal(5m, Rules.OptionOf(4, RunDifficulty.Risky)!.ListenSeconds);
        Assert.Equal(10m, Rules.OptionOf(4, RunDifficulty.Safe)!.ListenSeconds);
        Assert.Equal(10m, Rules.OptionOf(3, RunDifficulty.Risky)!.ListenSeconds);

        var noBoss = new RunsOptions { BossListenSeconds = 0 }.ToRules();
        Assert.Equal(10m, noBoss.OptionOf(4, RunDifficulty.Risky)!.ListenSeconds);
    }

    [Fact]
    public void UneSeuleDifficulte_PlusDeChoix()
    {
        var rules = new RunsOptions { Difficulties = [new() { Difficulty = "safe" }] }.ToRules();

        Assert.All(Enumerable.Range(1, 4), round => Assert.False(rules.HasChoice(round)));
    }

    [Fact]
    public void UnePlaylistDuProto1_UneSeuleDifficulte_SesSeuilsEtSonEcoute()
    {
        var rules = new RunRules(4, 5, 10m, [40, 50, 60, 70], 1m, 2m, 45);

        Assert.Equal(new RunDifficultyOption(RunDifficulty.Safe, 1m, 50, 10m), Assert.Single(rules.OptionsOf(2)));
        Assert.False(rules.HasChoice(2));
        Assert.Equal(0, rules.ReservePerRound);
    }

    [Fact]
    public void LaPhotoDesRegles_SeRelitTelleQuelle_EtCelleDuProto1_SansDifficultes()
    {
        var json = JsonSerializer.Serialize(Rules, JsonSerializerOptions.Web);
        var read = JsonSerializer.Deserialize<RunRules>(json, JsonSerializerOptions.Web)!;
        Assert.Equal(Rules.OptionsOf(3), read.OptionsOf(3));
        Assert.Equal(2, read.ReservePerRound);

        // La photo d'une playlist créée avant le proto 2 n'a ni roundRules ni reservePerRound.
        var proto1 = JsonSerializer.Deserialize<RunRules>(
            """{"rounds":4,"tracksPerRound":5,"listenSeconds":10,"thresholdPercents":[40,50,60,70],"minMultiplier":1,"maxMultiplier":2,"answerSeconds":45}""",
            JsonSerializerOptions.Web)!;
        Assert.Null(proto1.RoundRules);
        Assert.Equal(200, RunGauge.Of(Challenge(proto1), [], 1, Scoring, proto1.DefaultOptionOf(1)).Objective);
    }

    [Fact]
    public void LaManche2_ProposeLeChoix_ALaDifficulteChoisie_PointsEtObjectifSuivent()
    {
        var challenge = Challenge();
        var session = InRoundTwo(challenge);
        Assert.True(session.CanChooseDifficulty(challenge, 2));
        Assert.False(session.CanChooseDifficulty(challenge, 3));

        session.ChooseDifficulty(challenge, 2, RunDifficulty.Risky, Now);

        // 665 sans facteur : objectif 83 % = 552 ; un morceau trouvé vaut 100 × 1,33 × 1,33 = 177, la manche 885 au plus.
        var progress = session.RoundProgressOf(challenge, 2, Scoring);
        Assert.Equal((552, 885, RunDifficulty.Risky), (progress.Objective, progress.MaxScore, progress.Difficulty));
        session.Answer(challenge, Found, Scoring, Now);
        Assert.Equal(177, session.Answers[^1].Points);
        Assert.False(session.CanChooseDifficulty(challenge, 2));
    }

    [Fact]
    public void Facile_DesPointsReduits_UnObjectifBas()
    {
        var challenge = Challenge();
        var session = InRoundTwo(challenge);

        session.ChooseDifficulty(challenge, 2, RunDifficulty.Easy, Now);
        var steps = new[] { Found, Found, Found, Missed, Missed }.Select(o => session.Answer(challenge, o, Scoring, Now)).ToList();

        // 100 × 1,33 × 0,67 = 89 par morceau trouvé : 267 points, objectif 33 % de 665 = 219.
        Assert.Equal([89, 89, 89, 0, 0], session.Answers.Skip(5).Select(a => a.Points));
        Assert.Equal(RunStepOutcome.RoundPassed, steps[^1].Outcome);
        Assert.Equal(219, session.RoundProgressOf(challenge, 2, Scoring).Objective);
    }

    [Fact]
    public void ObjectifChoisiNonAtteint_FinDuRun_MemeAuDessusDeSure()
    {
        var challenge = Challenge();
        var session = InRoundTwo(challenge);

        session.ChooseDifficulty(challenge, 2, RunDifficulty.Risky, Now);
        var steps = new[] { Found, Found, Found, Missed, Missed }.Select(o => session.Answer(challenge, o, Scoring, Now)).ToList();

        // 3 × 177 = 531 : sous l'objectif de Risquée (552), au-dessus de celui de Sûre (366).
        Assert.Equal(RunStepOutcome.Lost, steps[^1].Outcome);
        Assert.Equal(RunSessionStatus.Lost, session.Status);
        Assert.Equal(1, session.RoundsPassed);
    }

    [Fact]
    public void SansChoix_LaMancheSeJoueEnSure_SansRienNoter()
    {
        var challenge = Challenge();
        var session = InRoundTwo(challenge);

        session.Answer(challenge, Found, Scoring, Now);

        Assert.Equal(133, session.Answers[^1].Points);
        // Seul un vrai choix est noté : la copie des données ne prête pas au joueur un choix qu'il n'a pas fait.
        Assert.Empty(session.Rounds);
        Assert.Equal(RunDifficulty.Safe, session.RoundProgressOf(challenge, 2, Scoring).Difficulty);
        Assert.False(session.CanChooseDifficulty(challenge, 2));
    }

    [Fact]
    public void LaPremiereManche_NaPasDeChoix()
    {
        var challenge = Challenge();
        var session = RunSession.Start(0, Guid.NewGuid(), Now);

        Assert.False(session.CanChooseDifficulty(challenge, 1));
        Assert.Throws<InvalidOperationException>(() => session.ChooseDifficulty(challenge, 1, RunDifficulty.Safe, Now));
        session.Answer(challenge, Found, Scoring, Now);
        Assert.Empty(session.Rounds);
    }

    [Fact]
    public void LeChoix_UneSeuleFois_EtJamaisApresLePremierSon()
    {
        var challenge = Challenge();
        var chosen = InRoundTwo(challenge);
        chosen.ChooseDifficulty(challenge, 2, RunDifficulty.Safe, Now);
        Assert.Throws<InvalidOperationException>(() => chosen.ChooseDifficulty(challenge, 2, RunDifficulty.Risky, Now));

        var listened = InRoundTwo(challenge);
        listened.KeepRound(listened.RoundOfCurrentTrack().Listen(3m));
        Assert.False(listened.CanChooseDifficulty(challenge, 2));

        var clocked = InRoundTwo(challenge);
        clocked.ServeCurrent(Now);
        clocked.StartClock(Now.AddSeconds(2));
        Assert.False(clocked.CanChooseDifficulty(challenge, 2));
    }

    [Fact]
    public void LeChoix_NeLancePasLeChrono_IlPartDeLEnvoiDeLExtraitQuiSuit()
    {
        var challenge = Challenge();
        var session = InRoundTwo(challenge);

        session.ChooseDifficulty(challenge, 2, RunDifficulty.Safe, Now.AddMinutes(3));

        // L'extrait du premier morceau de la manche n'est pas encore parti : rien ne court.
        Assert.Null(session.CurrentServedAt);
        Assert.Null(session.ClockRemaining(challenge.Rules, Now.AddMinutes(10)));
    }

    [Fact]
    public void UnPremierMorceauNeutralise_LaisseLeChoixOuvert()
    {
        var challenge = Challenge();
        var session = InRoundTwo(challenge);
        session.ChooseDifficulty(challenge, 2, RunDifficulty.Safe, Now);
        var other = InRoundTwo(challenge);

        other.Neutralize(challenge, Scoring, Now);

        Assert.True(other.CanChooseDifficulty(challenge, 2));
    }

    [Fact]
    public void LaMancheBoss_LEcouteDuMorceauEnCoursSuitLaDifficulte()
    {
        var challenge = Challenge();
        var session = RunSession.Start(0, Guid.NewGuid(), Now);
        for (var round = 1; round <= 3; round++)
        {
            for (var i = 0; i < 5; i++)
                session.Answer(challenge, Found, Scoring, Now);
        }

        Assert.Equal(4, session.CurrentRound(challenge));
        Assert.Equal(10m, session.ListenSecondsOf(challenge));
        session.ChooseDifficulty(challenge, 4, RunDifficulty.Risky, Now);
        Assert.Equal(5m, session.ListenSecondsOf(challenge));
    }

    [Fact]
    public void UneDifficulteNonProposee_Refusee()
    {
        var rules = new RunsOptions { Difficulties = [new() { Difficulty = "safe" }, new() { Difficulty = "risky", PointsFactor = 1.5m }] }.ToRules();
        var challenge = Challenge(rules);
        var session = InRoundTwo(challenge);

        Assert.Throws<ArgumentException>(() => session.ChooseDifficulty(challenge, 2, RunDifficulty.Easy, Now));
        Assert.Empty(session.Rounds);
    }

    [Fact]
    public void LaReserve_TireeDansLaTrancheDeLaManche_SansDoublon()
    {
        var selector = new RankBandSelector(new FisherYatesShuffle());
        var pool = Enumerable.Range(1, 100).Select(id => new RankedTrack(id, 1_000_000 - id * 1000)).ToList();

        var selection = selector.Select(pool, Rules, seed: 3);

        var reserve = selection.Reserve!;
        Assert.Equal(8, reserve.Count);
        Assert.All(Enumerable.Range(1, 4), round => Assert.Equal(2, reserve.Count(t => t.Round == round)));
        Assert.All(reserve, t => Assert.Equal((t.TrackId - 1) / 25 + 1, t.Round));
        Assert.Empty(reserve.Select(t => t.TrackId).Intersect(selection.Tracks.Select(t => t.TrackId)));
        Assert.Equal(reserve, selector.Select(pool, Rules, seed: 3).Reserve);
    }

    [Fact]
    public void UneTranchePetite_DonneMoinsDeReserve_JamaisMoinsDeMorceaux()
    {
        var selector = new RankBandSelector(new FisherYatesShuffle());
        var pool = Enumerable.Range(1, 24).Select(id => new RankedTrack(id, 1_000_000 - id * 1000)).ToList();

        var selection = selector.Select(pool, Rules, seed: 3);

        Assert.True(selection.IsSufficient);
        Assert.Equal(20, selection.Tracks.Count);
        Assert.Equal(4, selection.Reserve!.Count);
        Assert.All(selection.Reserve, t => Assert.Equal(1, selection.Reserve.Count(r => r.Round == t.Round)));
    }

    [Fact]
    public void LeDefi_GardeSaReserveParManche_EtRefuseUnMorceauDejaJoue()
    {
        var tracks = Enumerable.Range(1, 20).Select(id => new PlannedTrack(id, (id - 1) / 5 + 1, 1m)).ToList();
        var reserve = new List<PlannedTrack> { new(21, 1, 1m), new(22, 1, 1m), new(23, 2, 1m) };

        var challenge = RunChallenge.Create("K7Q2M9", 1, Rules, tracks, null, Now, reserve);

        Assert.Equal([(1, 1, 21), (1, 2, 22)], challenge.ReserveOf(1).Select(r => ((int)r.Round, (int)r.Rank, r.TrackId)));
        Assert.Equal([23], challenge.ReserveOf(2).Select(r => r.TrackId));
        Assert.Empty(challenge.ReserveOf(3));
        Assert.Throws<ArgumentException>(() => RunChallenge.Create("K7Q2M9", 1, Rules, tracks, null, Now, [new(5, 1, 1m)]));
        Assert.Throws<ArgumentException>(() => RunChallenge.Create("K7Q2M9", 1, Rules, tracks, null, Now, [new(30, 5, 1m)]));
    }
}
