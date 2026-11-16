using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>La partie de la Série : verrou du morceau en cours, points du palier, vies, paliers de manche en manche, neutralisation, chrono.</summary>
public class RunSessionTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 23, 8, 0, 0, TimeSpan.Zero);
    private static readonly IRunScoringPolicy Scoring = new ArtistTitleScoring();
    private static readonly RoundOutcome Found = new(true, true, 10m, 0);
    private static readonly RoundOutcome Half = new(true, false, 10m, 0);
    private static readonly RoundOutcome Missed = new(false, false, 10m, 0);

    /// <summary>Un défi aux règles par défaut, dont <paramref name="rounds"/> manches sont tirées (morceaux 1, 2, 3…), d'identifiant 0 comme la partie.</summary>
    private static RunChallenge Challenge(int rounds = 4, RunRules? rules = null)
    {
        rules ??= RunsOptions.DefaultRules();
        var challenge = RunChallenge.Create("K7Q2M9", 1, rules, Enumerable.Range(1, rules.TracksPerRound).ToList(), null, Now);
        for (var round = 2; round <= rounds; round++)
            challenge.AppendRound(round, Enumerable.Range(rules.FirstPositionOf(round), rules.TracksPerRound).ToList());
        return challenge;
    }

    private static RunSession Start() => RunSession.Start(0, Guid.NewGuid(), Now);

    private static List<RunStep> Play(RunSession session, RunChallenge challenge, params RoundOutcome[] outcomes) =>
        outcomes.Select(o => session.Answer(challenge, o, Scoring, Now)).ToList();

    private static RoundOutcome[] Repeat(RoundOutcome outcome, int count) => [.. Enumerable.Repeat(outcome, count)];

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
    public void UnMorceauPasEncoreTire_EstInconnu()
    {
        var session = Start();

        Assert.Equal(RunTrackTurn.Unknown, session.TurnOf(6, trackCount: 5));
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
    public void LesPoints_SontCeuxDuPalierDeLaManche_MoitieSiUnSeulJuste()
    {
        var challenge = Challenge();
        var session = Start();

        Play(session, challenge, Found, Half, Found);

        Assert.Equal([100, 50, 100], session.Answers.Select(a => a.Points));
        Assert.Equal(250, session.TotalScore);
        Assert.Equal(3, session.LivesLeft(challenge.Rules));
    }

    [Fact]
    public void UneMancheSansErreur_RaccourcitLePalier_PuisLesPointsMontent()
    {
        var challenge = Challenge();
        var session = Start();

        var steps = Play(session, challenge, Repeat(Found, 5));
        Assert.Equal(RunStepOutcome.RoundDone, steps[^1].Outcome);
        Assert.Equal((0, 1), (steps[^1].FromStep, steps[^1].ToStep));
        Assert.Equal(1, session.RoundsPassed);
        Assert.Equal(5m, session.ListenSecondsOf(challenge.Rules));

        Play(session, challenge, Found);
        Assert.Equal(200, session.Answers[^1].Points);
        Assert.Equal(700, session.TotalScore);
    }

    [Fact]
    public void UneMancheAvecUneErreur_AllongeLePalier_JamaisAuDessusDuPremier()
    {
        var challenge = Challenge();
        var session = Start();

        var first = Play(session, challenge, Found, Found, Found, Found, Missed);
        Assert.Equal((0, 0), (first[^1].FromStep, first[^1].ToStep));
        Assert.Equal(10m, session.ListenSecondsOf(challenge.Rules));
        Assert.Equal(2, session.LivesLeft(challenge.Rules));

        // Une manche sans erreur descend d'un palier, une manche ratée en remonte un.
        Play(session, challenge, Repeat(Found, 5));
        Assert.Equal(5m, session.ListenSecondsOf(challenge.Rules));
        var third = Play(session, challenge, Found, Found, Found, Found, Missed);
        Assert.Equal((1, 0), (third[^1].FromStep, third[^1].ToStep));
        Assert.Equal(10m, session.ListenSecondsOf(challenge.Rules));
    }

    [Fact]
    public void UneMancheDeMoities_NeBougePasLePalier_EtNeCouteAucuneVie()
    {
        var challenge = Challenge();
        var session = Start();

        var steps = Play(session, challenge, Found, Half, Found, Found, Found);

        Assert.Equal((0, 0), (steps[^1].FromStep, steps[^1].ToStep));
        Assert.Equal(3, session.LivesLeft(challenge.Rules));
    }

    [Fact]
    public void LePalierLePlusCourt_SeRepete()
    {
        var challenge = Challenge(rounds: 7);
        var session = Start();

        Play(session, challenge, Repeat(Found, 30));

        Assert.Equal(6, session.RoundsPassed);
        Assert.Equal(0.5m, session.ListenSecondsOf(challenge.Rules));
        Assert.Equal(1200, session.Answers[^1].Points);
    }

    [Fact]
    public void LaDerniereVie_ArreteLaPartieNet_AuMilieuDUneManche()
    {
        var challenge = Challenge();
        var session = Start();

        var steps = Play(session, challenge, Found, Missed, Missed, Missed);

        Assert.Equal(RunStepOutcome.Over, steps[^1].Outcome);
        Assert.Equal(RunSessionStatus.Lost, session.Status);
        Assert.False(session.IsPending);
        Assert.Equal(0, session.RoundsPassed);
        Assert.Equal(0, session.LivesLeft(challenge.Rules));
        Assert.NotNull(session.EndedAt);
        Assert.Null(session.CurrentPosition);
    }

    [Fact]
    public void UneReponseApresLeChrono_CompteCommeUnMorceauPasse()
    {
        var challenge = Challenge();
        var session = Start();
        session.ServeCurrent(Now);
        session.StartClock(Now);

        session.Answer(challenge, Found, Scoring, Now.AddSeconds(challenge.Rules.AnswerSeconds + 6));

        Assert.Equal(0, session.Answers[0].Points);
        Assert.True(session.Answers[0].IsFailed);
        Assert.Equal(2, session.LivesLeft(challenge.Rules));
    }

    [Fact]
    public void UnMorceauNeutralise_NeRapporteRien_NeCouteAucuneVie_NeCompteDansAucunPalier()
    {
        var challenge = Challenge();
        var session = Start();

        session.Neutralize(challenge, Now);
        var steps = Play(session, challenge, Found, Found, Found, Found);

        Assert.True(session.Answers[0].Neutralized);
        Assert.Equal(0, session.Answers[0].Points);
        Assert.Equal(3, session.LivesLeft(challenge.Rules));
        // Les quatre autres morceaux, tous justes : la manche descend d'un palier malgré le morceau retiré.
        Assert.Equal((0, 1), (steps[^1].FromStep, steps[^1].ToStep));
    }

    [Fact]
    public void UneMancheEntiereNeutralisee_LaisseLePalier()
    {
        var challenge = Challenge();
        var session = Start();

        for (var i = 0; i < 5; i++)
            session.Neutralize(challenge, Now);

        Assert.Equal(1, session.RoundsPassed);
        Assert.Equal(10m, session.ListenSecondsOf(challenge.Rules));
    }

    [Fact]
    public void LeChrono_PartAuPremierSon_UneSeuleFois_EtPasPlusTardQueLaLimite()
    {
        var challenge = Challenge();
        var session = Start();
        session.ServeCurrent(Now);

        Assert.Null(session.ClockRemaining(challenge.Rules, Now));
        session.StartClock(Now.AddSeconds(2));
        session.StartClock(Now.AddSeconds(9));

        Assert.Equal(43m, session.ClockRemaining(challenge.Rules, Now.AddSeconds(4)));
        Assert.Equal(0m, session.ClockRemaining(challenge.Rules, Now.AddMinutes(5)));
    }

    [Fact]
    public void UnePartieFinie_NAcceptePlusDeReponse()
    {
        var challenge = Challenge();
        var session = Start();
        session.Abandon(Now);

        Assert.Equal(RunSessionStatus.Abandoned, session.Status);
        Assert.Throws<InvalidOperationException>(() => session.Answer(challenge, Found, Scoring, Now));
        Assert.Throws<InvalidOperationException>(() => session.Abandon(Now));
    }

    [Fact]
    public void LePalierDUneMancheFuture_SeCalculeSurLesMancheEntieres()
    {
        var challenge = Challenge();
        var session = Start();
        Play(session, challenge, Repeat(Found, 10));

        Assert.Equal(0, session.StepOf(challenge.Rules, 1));
        Assert.Equal(1, session.StepOf(challenge.Rules, 2));
        Assert.Equal(2, session.StepOf(challenge.Rules, 3));
    }
}
