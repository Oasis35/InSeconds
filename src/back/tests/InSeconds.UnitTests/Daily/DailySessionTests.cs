using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.UnitTests.Daily;

public class DailySessionTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);

    private static DailySession NewSession() => DailySession.Start(Guid.NewGuid(), challengeId: 7, Now);

    private static RoundOutcome Found(decimal seconds = 1) => new(true, true, seconds);

    [Fact]
    public void Start_EstEnCours_SurLePremierMorceau_SansRienEcoute()
    {
        var session = NewSession();

        Assert.Equal((SessionStatus.Pending, 0, 1, 0), (session.Status, session.AnsweredCount, session.NextPosition, session.TotalScore));
        Assert.Null(session.CurrentPosition);
        Assert.Equal(TrackRound.Start, session.RoundOfCurrentTrack());
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
        session.Answer(Found(), 850, false, 5, Now);
        session.Answer(Found(), 850, false, 5, Now);

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

    // --- la seconde tentative (piège 51) ---

    [Fact]
    public void RecordFailedAttempt_UneSeuleTentativeEnPlus_EtLePalierAnnonceDevientLePlancher()
    {
        var session = NewSession();
        session.KeepRound(TrackRound.Start.Listen(1));

        session.RecordFailedAttempt(2);

        Assert.Equal(1, session.FailedAttemptsOfCurrentTrack);
        // La seconde tentative ne peut pas annoncer plus court que la première : le prix suit le dernier palier.
        Assert.Equal(2, session.RoundOfCurrentTrack().ListenedSeconds);
    }

    [Theory]
    [InlineData(true, 1, false, false, true)]
    [InlineData(false, 1, false, false, false)] // réglage coupé
    [InlineData(true, 0, false, false, false)] // palier 0 : pas d'extrait
    [InlineData(true, 1, true, false, false)] // passer ou réponse vide : définitif
    [InlineData(true, 1, false, true, false)] // artiste et titre trouvés
    public void CanOfferRetry_SeulementPourUneVraieReponsePasEntierementJuste(bool enabled, decimal seconds, bool blank, bool foundBoth, bool expected)
    {
        Assert.Equal(expected, NewSession().CanOfferRetry(enabled, seconds, blank, foundBoth));
    }

    [Fact]
    public void CanOfferRetry_UneSeuleFoisParMorceau()
    {
        var session = NewSession();
        session.RecordFailedAttempt(1);

        Assert.False(session.CanOfferRetry(true, 1, false, false));
    }

    [Fact]
    public void RecordFailedAttempt_LePlancherNeDescendJamais()
    {
        var session = NewSession();
        session.KeepRound(TrackRound.Start.Listen(5));

        session.RecordFailedAttempt(1);

        Assert.Equal(5, session.RoundOfCurrentTrack().ListenedSeconds);
    }

    [Fact]
    public void Answer_LibereLeVerrou_EtLaProchainePisteRepartAZeroTentativeRatee()
    {
        var session = NewSession();
        session.RecordFailedAttempt(1);

        session.Answer(Found(), 595, false, 5, Now);

        Assert.Equal(0, session.FailedAttemptsOfCurrentTrack);
        Assert.Equal(0, session.CurrentFailedAttempts);
    }

    [Fact]
    public void FailedAttemptsOfCurrentTrack_ZeroSansVerrou() => Assert.Equal(0, NewSession().FailedAttemptsOfCurrentTrack);

    [Fact]
    public void KeepRound_PoseLeVerrouSurLeMorceauEnCours_EtLaMancheSeReconstitue()
    {
        var session = NewSession();

        session.KeepRound(TrackRound.Start.Listen(6));

        Assert.Equal((short)1, session.CurrentPosition);
        var round = session.RoundOfCurrentTrack();
        Assert.Equal(6m, round.ListenedSeconds);
    }

    [Fact]
    public void RoundOfCurrentTrack_UnVerrouSurUnAutreMorceau_RepartDeZero()
    {
        var session = NewSession();
        session.KeepRound(TrackRound.Resume(10));
        session.Answer(Found(10), 40, false, 5, Now);
        // Le verrou est libéré par la réponse : le morceau 2 ne reprend pas l'écoute du morceau 1.
        Assert.Equal(TrackRound.Start, session.RoundOfCurrentTrack());
    }

    // --- les réponses ---

    [Fact]
    public void Answer_AjouteLaReponse_CumuleLeScoreEtLesSecondes_LiberantLeVerrou()
    {
        var session = NewSession();
        session.KeepRound(TrackRound.Resume(2));

        var completed = session.Answer(Found(2), 550, wasExtended: true, 5, Now);

        Assert.False(completed);
        var answer = Assert.Single(session.Answers);
        Assert.Equal(((short)1, 2m, true, 550, (DateTimeOffset?)Now),
            (answer.Position, answer.ListenedSeconds, answer.WasExtended, answer.Score, answer.AnsweredAt));
        Assert.Equal((550, 2m, 2), (session.TotalScore, session.TotalListenedSeconds, session.NextPosition));
        Assert.Null(session.CurrentPosition);
        Assert.Null(session.CurrentListenedSeconds);
    }

    [Fact]
    public void Answer_GardeLaCorrectionDeLaReponse()
    {
        var session = NewSession();

        session.Answer(new RoundOutcome(true, false, 5), 125, false, 5, Now);

        var answer = Assert.Single(session.Answers);
        Assert.Equal((true, false), (answer.ArtistCorrect, answer.TitleCorrect));
    }

    [Fact]
    public void Answer_LeDernierMorceauDuDefi_TermineLaPartie()
    {
        var session = NewSession();
        for (var i = 0; i < 4; i++)
            Assert.False(session.Answer(Found(), 850, false, trackCount: 5, Now));

        var completed = session.Answer(Found(), 850, false, trackCount: 5, Now.AddMinutes(3));

        Assert.True(completed);
        Assert.Equal((SessionStatus.Completed, Now.AddMinutes(3), 4250), (session.Status, session.EndedAt, session.TotalScore));
    }

    [Fact]
    public void Answer_SeTermineSurLeNombreReelDeMorceaux_PasSurCinq()
    {
        var session = NewSession();
        session.Answer(Found(), 850, false, trackCount: 3, Now);
        session.Answer(Found(), 850, false, trackCount: 3, Now);

        Assert.True(session.Answer(Found(), 850, false, trackCount: 3, Now));
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
    public void Statuts_ValeursStockeesEnBase()
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
