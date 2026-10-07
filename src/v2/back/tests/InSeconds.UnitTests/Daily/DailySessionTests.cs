using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.UnitTests.Daily;

public class DailySessionTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);
    private static readonly HintPolicy Hints = new([5m, 10m]);

    private static DailySession NewSession() => DailySession.Start(Guid.NewGuid(), challengeId: 7, Now);

    private static RoundOutcome Found(decimal seconds = 1, int hintLevel = 0) => new(true, true, seconds, hintLevel);

    [Fact]
    public void Start_EstEnCours_SurLePremierMorceau_SansRienEcoute()
    {
        var session = NewSession();

        Assert.Equal((SessionStatus.Pending, 0, 1, 0), (session.Status, session.AnsweredCount, session.NextPosition, session.TotalScore));
        Assert.Null(session.CurrentPosition);
        Assert.Equal(TrackRound.Start, session.RoundOfCurrentTrack(Hints));
    }

    // --- le verrou : toujours le premier morceau sans réponse (piège 35) ---

    [Theory]
    [InlineData(1, TrackTurn.Current)]
    [InlineData(2, TrackTurn.NotYet)]
    [InlineData(5, TrackTurn.NotYet)]
    [InlineData(0, TrackTurn.Unknown)]
    [InlineData(6, TrackTurn.Unknown)]
    public void TurnOf_AvantToute_Reponse(int position, TrackTurn expected) =>
        Assert.Equal(expected, NewSession().TurnOf(position, trackCount: 5));

    [Fact]
    public void TurnOf_ApresDeuxReponses()
    {
        var session = NewSession();
        session.Answer(Found(), 850, false, null, null, 5, Now);
        session.Answer(Found(), 850, false, null, null, 5, Now);

        Assert.Equal(
            [TrackTurn.AlreadyAnswered, TrackTurn.AlreadyAnswered, TrackTurn.Current, TrackTurn.NotYet, TrackTurn.NotYet],
            Enumerable.Range(1, 5).Select(p => session.TurnOf(p, 5)));
    }

    [Fact]
    public void TurnOf_CompteLesMorceauxReelsDuDefi_PasUnReglage()
    {
        // Un défi de 3 morceaux : la position 4 n'existe pas, quel que soit le réglage du moment (piège 38).
        Assert.Equal(TrackTurn.Unknown, NewSession().TurnOf(4, trackCount: 3));
    }

    [Fact]
    public void KeepRound_PoseLeVerrouSurLeMorceauEnCours_EtLaMancheSeReconstitue()
    {
        var session = NewSession();

        session.KeepRound(TrackRound.Start.Listen(6).RevealHint(1, Hints).Round!);

        Assert.Equal((short)1, session.CurrentPosition);
        var round = session.RoundOfCurrentTrack(Hints);
        Assert.Equal((6m, 1), (round.ListenedSeconds, round.HintLevel));
    }

    [Fact]
    public void RoundOfCurrentTrack_UnVerrouSurUnAutreMorceau_RepartDeZero()
    {
        var session = NewSession();
        session.KeepRound(TrackRound.Resume(10, 2));
        session.Answer(Found(10, 2), 40, false, null, null, 5, Now);
        // Le verrou est libéré par la réponse : le morceau 2 ne reprend ni l'écoute ni l'indice du morceau 1.
        Assert.Equal(TrackRound.Start, session.RoundOfCurrentTrack(Hints));
    }

    [Fact]
    public void RoundOfCurrentTrack_BorneLeNiveauDIndiceALaPolitique()
    {
        var session = NewSession();
        session.KeepRound(TrackRound.Resume(10, 2));

        // Le réglage a perdu un niveau : le niveau 2 relu ne pénalise plus le score.
        var round = session.RoundOfCurrentTrack(new HintPolicy([5m]));

        Assert.Equal(1, round.HintLevel);
        Assert.Equal(0, session.RoundOfCurrentTrack(HintPolicy.None).HintLevel);
    }

    // --- les réponses ---

    [Fact]
    public void Answer_AjouteLaReponse_CumuleLeScoreEtLesSecondes_LiberantLeVerrou()
    {
        var session = NewSession();
        session.KeepRound(TrackRound.Resume(2, 0));

        var completed = session.Answer(Found(2), 550, wasExtended: true, "Daft Punk", "Around", 5, Now);

        Assert.False(completed);
        var answer = Assert.Single(session.Answers);
        Assert.Equal(((short)1, 2m, true, "Daft Punk", "Around", 550, (DateTimeOffset?)Now),
            (answer.Position, answer.ListenedSeconds, answer.WasExtended, answer.ArtistAnswer, answer.TitleAnswer, answer.Score, answer.AnsweredAt));
        Assert.Equal((550, 2m, 2), (session.TotalScore, session.TotalListenedSeconds, session.NextPosition));
        Assert.Null(session.CurrentPosition);
        Assert.Null(session.CurrentListenedSeconds);
        Assert.Equal((short)0, session.CurrentHintLevel);
    }

    [Fact]
    public void Answer_GardeLeNiveauDIndiceEtLaCorrectionDeLaReponse()
    {
        var session = NewSession();

        session.Answer(new RoundOutcome(true, false, 5, 1), 125, false, null, null, 5, Now);

        var answer = Assert.Single(session.Answers);
        Assert.Equal((true, false, (short)1), (answer.ArtistCorrect, answer.TitleCorrect, answer.HintLevel));
    }

    [Fact]
    public void Answer_LeDernierMorceauDuDefi_TermineLaPartie()
    {
        var session = NewSession();
        for (var i = 0; i < 4; i++)
            Assert.False(session.Answer(Found(), 850, false, null, null, trackCount: 5, Now));

        var completed = session.Answer(Found(), 850, false, null, null, trackCount: 5, Now.AddMinutes(3));

        Assert.True(completed);
        Assert.Equal((SessionStatus.Completed, Now.AddMinutes(3), 4250), (session.Status, session.EndedAt, session.TotalScore));
    }

    [Fact]
    public void Answer_SeTermineSurLeNombreReelDeMorceaux_PasSurCinq()
    {
        var session = NewSession();
        session.Answer(Found(), 850, false, null, null, trackCount: 3, Now);
        session.Answer(Found(), 850, false, null, null, trackCount: 3, Now);

        Assert.True(session.Answer(Found(), 850, false, null, null, trackCount: 3, Now));
    }

    // --- les fins de partie ---

    [Fact]
    public void Abandon_EtExpire_SontDeuxStatutsDistincts_AvecLaDateDeFin()
    {
        var abandoned = NewSession();
        var expired = NewSession();

        abandoned.Abandon(Now);
        expired.Expire(Now.AddDays(1));

        Assert.Equal((SessionStatus.Abandoned, (DateTimeOffset?)Now), (abandoned.Status, abandoned.EndedAt));
        Assert.Equal((SessionStatus.Expired, (DateTimeOffset?)Now.AddDays(1)), (expired.Status, expired.EndedAt));
    }

    [Fact]
    public void Statuts_ValeursStockeesDuPlan()
    {
        Assert.Equal([0, 1, 2, 3], new[] { SessionStatus.Pending, SessionStatus.Completed, SessionStatus.Abandoned, SessionStatus.Expired }.Select(s => (int)s));
    }

    [Fact]
    public void RecordStreakEffect_GardeLesGelsConsommesEtGagnes()
    {
        var session = NewSession();

        session.RecordStreakEffect(new StreakCompletion(FreezesUsed: 2, FreezeEarned: true));

        Assert.Equal(((short)2, true), (session.FreezesUsed, session.FreezeEarned));
    }
}
