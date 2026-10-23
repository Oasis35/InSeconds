using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>La partie : verrou du morceau en cours, points, jauge par manche, neutralisation, fin sur le nombre réel de morceaux (piège 38).</summary>
public class RunSessionTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 23, 8, 0, 0, TimeSpan.Zero);
    private static readonly IRunScoringPolicy Scoring = new ArtistTitleScoring();
    private static readonly RoundOutcome Found = new(true, true, 10m, 0);
    private static readonly RoundOutcome Half = new(true, false, 10m, 0);
    private static readonly RoundOutcome Missed = new(false, false, 10m, 0);

    /// <summary>Un défi aux règles par défaut (4 manches de 5, ×1 ; 1,33 ; 1,67 ; 2), d'identifiant 0 comme la partie.</summary>
    private static RunChallenge Challenge(RunRules? rules = null)
    {
        rules ??= RunsOptions.DefaultRules();
        var tracks = Enumerable.Range(1, rules.TrackCount)
            .Select(id => new PlannedTrack(id, (id - 1) / rules.TracksPerRound + 1, rules.MultiplierOf((id - 1) / rules.TracksPerRound + 1)))
            .ToList();
        return RunChallenge.Create("K7Q2M9", 1, rules, tracks, null, Now);
    }

    private static RunSession Start() => RunSession.Start(0, Guid.NewGuid(), Now);

    private static List<RunStep> Play(RunSession session, RunChallenge challenge, params RoundOutcome[] outcomes) =>
        outcomes.Select(o => session.Answer(challenge, o, Scoring, Now)).ToList();

    [Fact]
    public void LeMorceauEnCours_EstLePremierSansReponse()
    {
        var challenge = Challenge();
        var session = Start();
        Play(session, challenge, Found, Found);

        Assert.Equal(RunTrackTurn.AlreadyAnswered, session.TurnOf(2, 20));
        Assert.Equal(RunTrackTurn.Current, session.TurnOf(3, 20));
        Assert.Equal(RunTrackTurn.NotYet, session.TurnOf(4, 20));
        Assert.Equal(RunTrackTurn.Unknown, session.TurnOf(21, 20));
        Assert.Equal(RunTrackTurn.Unknown, session.TurnOf(0, 20));
        Assert.Equal((short)3, session.CurrentPosition);
    }

    [Fact]
    public void LEcoute_GardeLeMaximum_EtRepartAZeroAuMorceauSuivant()
    {
        var challenge = Challenge();
        var session = Start();

        session.KeepRound(session.RoundOfCurrentTrack().Listen(10m));
        session.KeepRound(session.RoundOfCurrentTrack().Listen(4m));
        Assert.Equal(10m, session.CurrentListenedSeconds);

        Play(session, challenge, Found);
        Assert.Null(session.CurrentListenedSeconds);
        Assert.Equal(0m, session.RoundOfCurrentTrack().ListenedSeconds);
    }

    [Fact]
    public void LesPoints_AuMultiplicateurDeLaManche_ArrondisSurLeTotalDuMorceau()
    {
        var challenge = Challenge();
        var session = Start();
        Play(session, challenge, Found, Found, Found, Found, Found);

        Play(session, challenge, Found, Half);

        Assert.Equal([100, 100, 100, 100, 100, 133, 67], session.Answers.Select(a => a.Points));
        Assert.Equal(700, session.TotalScore);
    }

    [Fact]
    public void JaugePleineAvantLaFin_LaMancheContinue()
    {
        var challenge = Challenge();
        var session = Start();

        var steps = Play(session, challenge, Found, Found, Found);

        Assert.All(steps, s => Assert.Equal(RunStepOutcome.Continue, s.Outcome));
        Assert.True(session.IsPending);
        Assert.Equal(0, session.RoundsPassed);
    }

    [Fact]
    public void ObjectifAtteintPile_LaMancheEstPassee()
    {
        var challenge = Challenge();
        var session = Start();

        // Manche 1 : objectif 200 (40 % de 500), atteint avec 200 tout juste (>=).
        var steps = Play(session, challenge, Found, Found, Missed, Missed, Missed);

        Assert.Equal(new RunStep(1, RunStepOutcome.RoundPassed), steps[^1]);
        Assert.True(session.IsPending);
        Assert.Equal(1, session.RoundsPassed);
        Assert.Equal(6, session.NextPosition);
    }

    [Fact]
    public void ObjectifManque_LaPartieEstPerdue_EnFinDeManche()
    {
        var challenge = Challenge();
        var session = Start();

        var steps = Play(session, challenge, Found, Half, Missed, Missed, Missed);

        Assert.Equal(new RunStep(1, RunStepOutcome.Lost), steps[^1]);
        Assert.Equal(RunSessionStatus.Lost, session.Status);
        Assert.Equal(Now, session.EndedAt);
        Assert.Null(session.CurrentPosition);
        Assert.Equal(0, session.RoundsPassed);
        Assert.Throws<InvalidOperationException>(() => session.Answer(challenge, Found, Scoring, Now));
    }

    [Fact]
    public void QuatreManchesPassees_LaPartieEstGagnee()
    {
        var challenge = Challenge();
        var session = Start();

        var steps = Play(session, challenge, Enumerable.Repeat(Found, 20).ToArray());

        Assert.Equal(new RunStep(4, RunStepOutcome.Won), steps[^1]);
        Assert.Equal(RunSessionStatus.Won, session.Status);
        Assert.Equal(4, session.RoundsPassed);
        Assert.Equal(3000, session.TotalScore);
    }

    [Fact]
    public void LaFin_SeFaitSurLeNombreReelDeMorceauxDuDefi()
    {
        // Un défi de 2 manches de 3 : la partie se termine au 6e morceau, quel que soit le réglage du moment (piège 38).
        var challenge = Challenge(new RunRules(2, 3, 10m, [40, 50], 1m, 2m));
        var session = Start();

        var steps = Play(session, challenge, Found, Found, Found, Found, Found, Found);

        Assert.Equal(new RunStep(2, RunStepOutcome.Won), steps[^1]);
        Assert.Equal(RunSessionStatus.Won, session.Status);
    }

    [Fact]
    public void UnMorceauNeutralise_SortDuMaximum_EtLObjectifSeRecalcule()
    {
        var challenge = Challenge();
        var session = Start();
        Assert.Equal(200, session.RoundProgressOf(challenge, 1, Scoring).Objective);

        var step = session.Neutralize(challenge, Scoring, Now);

        Assert.Equal(RunStepOutcome.Continue, step.Outcome);
        var answer = Assert.Single(session.Answers);
        Assert.True(answer.Neutralized);
        Assert.Equal(0, answer.Points);
        var progress = session.RoundProgressOf(challenge, 1, Scoring);
        Assert.Equal((400, 160), (progress.MaxScore, progress.Objective));
    }

    [Fact]
    public void UneMancheEntierementNeutralisee_EstPassee()
    {
        var challenge = Challenge();
        var session = Start();

        RunStep last = null!;
        for (var i = 0; i < 5; i++)
            last = session.Neutralize(challenge, Scoring, Now);

        Assert.Equal(new RunStep(1, RunStepOutcome.RoundPassed), last);
        Assert.Equal(1, session.RoundsPassed);
        Assert.Equal(0, session.RoundProgressOf(challenge, 1, Scoring).Objective);
    }

    [Fact]
    public void Abandonner_TermineLaPartie_SansManchePassee()
    {
        var challenge = Challenge();
        var session = Start();
        Play(session, challenge, Found);

        session.Abandon(Now);

        Assert.Equal(RunSessionStatus.Abandoned, session.Status);
        Assert.Null(session.CurrentPosition);
        Assert.Throws<InvalidOperationException>(() => session.Abandon(Now));
    }

    [Fact]
    public void LeDefiDUneAutrePartie_EstRefuse()
    {
        var session = RunSession.Start(42, Guid.NewGuid(), Now);

        Assert.Throws<ArgumentException>(() => session.Answer(Challenge(), Found, Scoring, Now));
    }
}

public class RunGaugeTests
{
    [Theory]
    [InlineData(1, 500, 200)]
    [InlineData(2, 665, 333)]
    [InlineData(3, 835, 501)]
    [InlineData(4, 1000, 700)]
    public void Objectif_PourcentageDuMaximum_ArrondiAuPlusProche(int round, int max, int expected) =>
        Assert.Equal(expected, RunGauge.Objective(RunsOptions.DefaultRules(), round, max));

    [Fact]
    public void MancheInconnue_Refusee() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => RunGauge.Objective(RunsOptions.DefaultRules(), 5, 100));
}

public class ArtistTitleScoringTests
{
    private static readonly ArtistTitleScoring Scoring = new();

    [Theory]
    [InlineData(true, true, "1", 100)]
    [InlineData(true, false, "1", 50)]
    [InlineData(false, true, "1.33", 67)]
    [InlineData(true, true, "1.33", 133)]
    [InlineData(true, false, "1.67", 84)]
    [InlineData(true, true, "1.67", 167)]
    [InlineData(false, false, "2", 0)]
    [InlineData(true, true, "2", 200)]
    public void Points_ArtistePlusTitre_FoisLeMultiplicateur(bool artist, bool title, string multiplier, int expected) =>
        Assert.Equal(expected, Scoring.Points(new RoundOutcome(artist, title, 10m, 0), decimal.Parse(multiplier, System.Globalization.CultureInfo.InvariantCulture)));

    [Fact]
    public void Maximum_DesQuatreManches() =>
        Assert.Equal([500, 665, 835, 1000], new[] { 1m, 1.33m, 1.67m, 2m }.Select(m => Scoring.MaxPoints(m) * 5));
}

public class DiscLadderTests
{
    private static readonly IReadOnlyList<string> Discs = RunsOptions.DefaultDiscs;

    [Theory]
    [InlineData(0, "runs.discs.scratched")]
    [InlineData(1, "runs.discs.wax")]
    [InlineData(2, "runs.discs.bronze")]
    [InlineData(3, "runs.discs.silver")]
    [InlineData(4, "runs.discs.gold")]
    public void ManchesPassees_DonnentLeDisque(int rounds, string expected) =>
        Assert.Equal(new RunDisc(expected, 0), DiscLadder.Of(rounds, Discs));

    [Theory]
    [InlineData(5, 2)]
    [InlineData(6, 3)]
    public void AuDelaDeLEchelle_LeDernierDisquePrendDesEtoiles(int rounds, int stars) =>
        Assert.Equal(new RunDisc("runs.discs.gold", stars), DiscLadder.Of(rounds, Discs));
}

public class RunRecordTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 23, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void UnScoreMeilleur_DevientLeRecord_PlusDeManches_AmeliorentLeDisque()
    {
        var player = Guid.NewGuid();
        var record = RunRecord.Create(player, 1200, 2, sessionId: 1, Now);
        var challenge = RunChallenge.Create("K7Q2M9", 1, RunsOptions.DefaultRules(),
            Enumerable.Range(1, 20).Select(id => new PlannedTrack(id, (id - 1) / 5 + 1, 1m)).ToList(), null, Now);
        var session = RunSession.Start(0, player, Now);
        for (var i = 0; i < 15; i++)
            session.Answer(challenge, new RoundOutcome(true, i < 12, 10m, 0), new ArtistTitleScoring(), Now);

        // 12 × 100 + 3 × 50 = 1 350 : meilleur score, 3 manches passées (350 sur 500 à la 3e, objectif 60 % : 300).
        record.Improve(session, Now.AddHours(1));

        Assert.Equal((1350, (short)3, Now.AddHours(1)), (record.BestScore, record.BestRoundsPassed, record.AchievedAt));
    }

    [Fact]
    public void UnScoreMoindre_NeChangeRien()
    {
        var player = Guid.NewGuid();
        var record = RunRecord.Create(player, 2000, 4, sessionId: 1, Now);

        record.Improve(RunSession.Start(0, player, Now), Now.AddHours(1));

        Assert.Equal((2000, (short)4, 1, Now), (record.BestScore, record.BestRoundsPassed, record.SessionId, record.AchievedAt));
    }

    [Fact]
    public void LaPartieDUnAutreJoueur_EstRefusee() =>
        Assert.Throws<ArgumentException>(() => RunRecord.Create(Guid.NewGuid(), 0, 0, 1, Now).Improve(RunSession.Start(0, Guid.NewGuid(), Now), Now));
}
