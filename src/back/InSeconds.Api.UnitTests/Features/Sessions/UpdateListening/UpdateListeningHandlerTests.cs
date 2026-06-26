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

        db.Players.Add(new Player
        {
            Id        = PlayerId,
            IsGuest   = true,
            AuthToken = Guid.NewGuid(),
            CreatedAt = DateTime.UtcNow,
        });
        db.DailyChallenges.Add(new DailyChallenge
        {
            Id     = 1,
            Date   = DateOnly.FromDateTime(DateTime.UtcNow),
            Seed   = 42,
            Tracks = [],
        });
        await db.SaveChangesAsync();

        db.GameSessions.Add(new GameSession
        {
            Id                               = 1,
            PlayerId                         = PlayerId,
            DailyChallengeId                 = 1,
            TotalScore                       = 0,
            TotalDurationSeconds             = 0,
            CreatedAt                        = DateTime.UtcNow,
            Status                           = status,
            CurrentTrackId                   = existingTrackId,
            CurrentTrackMinListenedSeconds   = existingMin,
        });
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

    [Fact]
    public async Task Handle_DifferentTrack_ResetsMin()
    {
        // Arrange
        var (db, sessionId) = await SeedAsync(existingTrackId: 42, existingMin: 5m);
        var command = new UpdateListeningCommand(PlayerId, sessionId, TrackId: 99, ListenedSeconds: 1m);

        // Act
        await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var session = await db.GameSessions.FindAsync(sessionId);
        session!.CurrentTrackId.Should().Be(99);
        session.CurrentTrackMinListenedSeconds.Should().Be(1m, "nouvelle track — le min repart de la durée actuelle");

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
