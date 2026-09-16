using FluentAssertions;
using Xunit;
using InSeconds.Api.Domain;

namespace InSeconds.Api.UnitTests.Domain;

public sealed class GameSessionTests
{
    private static GameSession BuildSession() =>
        GameSession.StartNew(Guid.NewGuid(), dailyChallengeId: 1, DateTime.UtcNow);

    // ---------------------------------------------------------------------------
    // StartNew
    // ---------------------------------------------------------------------------

    [Fact]
    public void StartNew_CreatesPendingSessionWithZeroScore()
    {
        var playerId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var session = GameSession.StartNew(playerId, dailyChallengeId: 42, now);

        session.PlayerId.Should().Be(playerId);
        session.DailyChallengeId.Should().Be(42);
        session.CreatedAt.Should().Be(now);
        session.Status.Should().Be(SessionStatus.Pending);
        session.TotalScore.Should().Be(0);
        session.TotalDurationSeconds.Should().Be(0);
    }

    // ---------------------------------------------------------------------------
    // AddAnswerScore
    // ---------------------------------------------------------------------------

    [Fact]
    public void AddAnswerScore_AccumulatesScoreAndDurationAcrossMultipleCalls()
    {
        var session = BuildSession();

        session.AddAnswerScore(400, 3m);
        session.AddAnswerScore(250, 5m);

        session.TotalScore.Should().Be(650);
        session.TotalDurationSeconds.Should().Be(8m);
    }

    // ---------------------------------------------------------------------------
    // Complete / Abandon / Expire — même AbandonedAt mais Status différent
    // (distinction utilisée par les stats admin : clic explicite vs sortie sans terminer)
    // ---------------------------------------------------------------------------

    [Fact]
    public void Complete_SetsStatusCompletedAndCompletedAt()
    {
        var session = BuildSession();
        var now = DateTime.UtcNow;

        session.Complete(now);

        session.Status.Should().Be(SessionStatus.Completed);
        session.CompletedAt.Should().Be(now);
        session.AbandonedAt.Should().BeNull();
    }

    [Fact]
    public void Abandon_SetsStatusAbandonedAndAbandonedAt()
    {
        var session = BuildSession();
        var now = DateTime.UtcNow;

        session.Abandon(now);

        session.Status.Should().Be(SessionStatus.Abandoned);
        session.AbandonedAt.Should().Be(now);
        session.CompletedAt.Should().BeNull();
    }

    [Fact]
    public void Expire_SetsStatusExpiredAndAbandonedAt()
    {
        var session = BuildSession();
        var now = DateTime.UtcNow;

        session.Expire(now);

        session.Status.Should().Be(SessionStatus.Expired);
        session.AbandonedAt.Should().Be(now);
        session.CompletedAt.Should().BeNull();
    }

    [Fact]
    public void Abandon_And_Expire_ShareAbandonedAt_ButDifferByStatus()
    {
        var abandoned = BuildSession();
        var expired = BuildSession();
        var now = DateTime.UtcNow;

        abandoned.Abandon(now);
        expired.Expire(now);

        abandoned.AbandonedAt.Should().Be(expired.AbandonedAt);
        abandoned.Status.Should().NotBe(expired.Status);
    }

    // ---------------------------------------------------------------------------
    // UpdateTrackLock — invariant anti-cheat le plus critique : ne jamais réduire
    // le minimum déjà écouté sur la track en cours.
    // ---------------------------------------------------------------------------

    [Fact]
    public void UpdateTrackLock_NewTrack_SetsIdAndMinimum()
    {
        var session = BuildSession();

        session.UpdateTrackLock(trackId: 42, listenedSeconds: 1.5m);

        session.CurrentTrackId.Should().Be(42);
        session.CurrentTrackMinListenedSeconds.Should().Be(1.5m);
    }

    [Fact]
    public void UpdateTrackLock_SameTrackHigherDuration_UpdatesMinimum()
    {
        var session = BuildSession();
        session.UpdateTrackLock(trackId: 42, listenedSeconds: 1m);

        session.UpdateTrackLock(trackId: 42, listenedSeconds: 3m);

        session.CurrentTrackMinListenedSeconds.Should().Be(3m);
    }

    [Fact]
    public void UpdateTrackLock_SameTrackLowerDuration_NeverReducesMinimum()
    {
        var session = BuildSession();
        session.UpdateTrackLock(trackId: 42, listenedSeconds: 5m);

        session.UpdateTrackLock(trackId: 42, listenedSeconds: 2m);

        session.CurrentTrackMinListenedSeconds.Should().Be(5m, "l'anti-cheat ne doit jamais descendre en dessous du max déjà enregistré");
    }

    [Fact]
    public void UpdateTrackLock_SameTrackEqualDuration_KeepsMinimumUnchanged()
    {
        var session = BuildSession();
        session.UpdateTrackLock(trackId: 42, listenedSeconds: 3m);

        session.UpdateTrackLock(trackId: 42, listenedSeconds: 3m);

        session.CurrentTrackMinListenedSeconds.Should().Be(3m);
    }

    [Fact]
    public void UpdateTrackLock_DifferentTrack_ResetsIdAndMinimum()
    {
        var session = BuildSession();
        session.UpdateTrackLock(trackId: 42, listenedSeconds: 5m);

        session.UpdateTrackLock(trackId: 99, listenedSeconds: 1m);

        session.CurrentTrackId.Should().Be(99);
        session.CurrentTrackMinListenedSeconds.Should().Be(1m, "nouvelle track — le minimum repart de la durée actuelle");
    }

    // ---------------------------------------------------------------------------
    // ReleaseTrackLock
    // ---------------------------------------------------------------------------

    [Fact]
    public void ReleaseTrackLock_ClearsBothFields()
    {
        var session = BuildSession();
        session.UpdateTrackLock(trackId: 42, listenedSeconds: 3m);

        session.ReleaseTrackLock();

        session.CurrentTrackId.Should().BeNull();
        session.CurrentTrackMinListenedSeconds.Should().BeNull();
    }
}
