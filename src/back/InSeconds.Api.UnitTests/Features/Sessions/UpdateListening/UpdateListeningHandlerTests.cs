using FluentAssertions;
using Xunit;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Sessions.UpdateListening;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.UnitTests.Features.Sessions.UpdateListening;

public sealed class UpdateListeningHandlerTests
{
    private static readonly Guid PlayerId = new("11111111-1111-1111-1111-111111111111");

    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static UpdateListeningHandler CreateHandler(ApplicationDbContext db) => new(db);

    private static async Task<(ApplicationDbContext db, int sessionId)> SeedAsync(
        SessionStatus status = SessionStatus.Pending,
        int? existingTrackId = null,
        decimal? existingMin = null)
    {
        var db = CreateDbContext();

        db.Players.Add(Player.CreateGuest(PlayerId, Guid.NewGuid(), DateTime.UtcNow));
        db.DailyChallenges.Add(new DailyChallenge
        {
            Id     = 1,
            Date   = DateOnly.FromDateTime(DateTime.UtcNow),
            Seed   = 42,
            Tracks = [],
        });
        await db.SaveChangesAsync();

        // M1 (revue du 25/09) : le handler vérifie désormais que le TrackId appartient
        // bien à ce défi (db.DailyChallengeTracks) — les tests utilisent les ids 42/99,
        // il faut donc de vraies lignes DailyChallengeTrack sous ces ids.
        db.Tracks.Add(new Track { Id = 42, DeezerTrackId = 942, Artist = "A42", Title = "T42", CreatedAt = DateTime.UtcNow });
        db.Tracks.Add(new Track { Id = 99, DeezerTrackId = 999, Artist = "A99", Title = "T99", CreatedAt = DateTime.UtcNow });
        db.DailyChallengeTracks.Add(new DailyChallengeTrack { Id = 42, DailyChallengeId = 1, TrackId = 42, Position = 1, DeezerRankSnapshot = 1 });
        db.DailyChallengeTracks.Add(new DailyChallengeTrack { Id = 99, DailyChallengeId = 1, TrackId = 99, Position = 2, DeezerRankSnapshot = 2 });
        await db.SaveChangesAsync();

        db.GameSessions.Add(GameSession.Restore(
            playerId: PlayerId,
            dailyChallengeId: 1,
            id: 1,
            createdAt: DateTime.UtcNow,
            status: status,
            currentTrackId: existingTrackId,
            currentTrackMinListenedSeconds: existingMin));
        await db.SaveChangesAsync();

        return (db, 1);
    }

    [Fact]
    public async Task Handle_NewTrack_StoresTrackAndDuration()
    {
        // Arrange
        var (db, sessionId) = await SeedAsync();
        var command = new UpdateListeningCommand(PlayerId, sessionId, TrackId: 42, ListenedSeconds: 1.5m);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status204NoContent);

        var session = await db.GameSessions.FindAsync(sessionId);
        session!.CurrentTrackId.Should().Be(42);
        session.CurrentTrackMinListenedSeconds.Should().Be(1.5m);

        await db.DisposeAsync();
    }

    [Fact]
    public async Task Handle_SameTrackHigherDuration_UpdatesMin()
    {
        // Arrange
        var (db, sessionId) = await SeedAsync(existingTrackId: 42, existingMin: 1m);
        var command = new UpdateListeningCommand(PlayerId, sessionId, TrackId: 42, ListenedSeconds: 3m);

        // Act
        await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var session = await db.GameSessions.FindAsync(sessionId);
        session!.CurrentTrackMinListenedSeconds.Should().Be(3m, "la durée écoutée est plus haute");

        await db.DisposeAsync();
    }

    [Fact]
    public async Task Handle_SameTrackLowerDuration_KeepsMax()
    {
        // Arrange
        var (db, sessionId) = await SeedAsync(existingTrackId: 42, existingMin: 5m);
        var command = new UpdateListeningCommand(PlayerId, sessionId, TrackId: 42, ListenedSeconds: 2m);

        // Act
        await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var session = await db.GameSessions.FindAsync(sessionId);
        session!.CurrentTrackMinListenedSeconds.Should().Be(5m, "on ne peut pas descendre en dessous du max déjà enregistré");

        await db.DisposeAsync();
    }

    // M1 (revue du 25/09) : déplacer le verrou vers un autre morceau du défi sans être
    // passé par SubmitAnswer (qui libère le verrou via ReleaseTrackLock) est désormais
    // refusé — avant ce fix, ce déplacement remettait silencieusement à zéro
    // CurrentTrackHintLevelUsed/CurrentTrackMinListenedSeconds du morceau réellement en
    // cours, contournant la pénalité d'indice et le plancher de durée écoutée.
    [Fact]
    public async Task Handle_DifferentTrack_WhileLockedAndUnanswered_ReturnsConflict()
    {
        // Arrange
        var (db, sessionId) = await SeedAsync(existingTrackId: 42, existingMin: 5m);
        var command = new UpdateListeningCommand(PlayerId, sessionId, TrackId: 99, ListenedSeconds: 1m);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status409Conflict);

        var session = await db.GameSessions.FindAsync(sessionId);
        session!.CurrentTrackId.Should().Be(42, "le verrou ne doit pas bouger tant que le morceau en cours n'a pas été répondu");
        session.CurrentTrackMinListenedSeconds.Should().Be(5m);

        await db.DisposeAsync();
    }

    [Fact]
    public async Task Handle_UnknownTrackId_ReturnsNotFound()
    {
        // Arrange — TrackId qui n'appartient à aucun DailyChallengeTrack de ce défi.
        var (db, sessionId) = await SeedAsync();
        var command = new UpdateListeningCommand(PlayerId, sessionId, TrackId: 12345, ListenedSeconds: 1m);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status404NotFound);

        await db.DisposeAsync();
    }

    [Fact]
    public async Task Handle_WrongPlayer_ReturnsForbid()
    {
        // Arrange
        var (db, sessionId) = await SeedAsync();
        var command = new UpdateListeningCommand(Guid.NewGuid(), sessionId, TrackId: 42, ListenedSeconds: 1m);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(403);

        await db.DisposeAsync();
    }

    [Fact]
    public async Task Handle_CompletedSession_ReturnsBadRequest()
    {
        // Arrange
        var (db, sessionId) = await SeedAsync(status: SessionStatus.Completed);
        var command = new UpdateListeningCommand(PlayerId, sessionId, TrackId: 42, ListenedSeconds: 1m);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status400BadRequest);

        await db.DisposeAsync();
    }

    [Fact]
    public async Task Handle_SessionNotFound_Returns404()
    {
        // Arrange
        await using var db = CreateDbContext();
        var command = new UpdateListeningCommand(PlayerId, 999, TrackId: 42, ListenedSeconds: 1m);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status404NotFound);
    }
}
