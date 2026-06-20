using FluentAssertions;
using Xunit;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Sessions.AbandonSession;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.UnitTests.Features.Sessions.AbandonSession;

public sealed class AbandonSessionHandlerTests
{
    private static readonly Guid PlayerId = new("11111111-1111-1111-1111-111111111111");

    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static AbandonSessionHandler CreateHandler(ApplicationDbContext db) => new(db);

    private static Player BuildPlayer() => new()
    {
        Id        = PlayerId,
        IsGuest   = true,
        AuthToken = Guid.NewGuid(),
        CreatedAt = DateTime.UtcNow,
        IsDeleted = false,
    };

    private static GameSession BuildSession(int id = 1, SessionStatus status = SessionStatus.Pending) => new()
    {
        Id                   = id,
        PlayerId             = PlayerId,
        DailyChallengeId     = 1,
        TotalScore           = 0,
        TotalDurationSeconds = 0,
        CreatedAt            = DateTime.UtcNow,
        Status               = status,
    };

    private static async Task SeedAsync(ApplicationDbContext db, SessionStatus status = SessionStatus.Pending)
    {
        db.Players.Add(BuildPlayer());
        var challenge = new DailyChallenge
        {
            Id     = 1,
            Date   = DateOnly.FromDateTime(DateTime.UtcNow),
            Seed   = 42,
            Tracks = [],
        };
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();

        db.GameSessions.Add(BuildSession(status: status));
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Handle_WhenPendingSession_MarksAbandoned()
    {
        // Arrange
        await using var db = CreateDbContext();
        await SeedAsync(db);

        var command = new AbandonSessionCommand(PlayerId, SessionId: 1);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status204NoContent);

        var session = await db.GameSessions.FindAsync(1);
        session!.Status.Should().Be(SessionStatus.Abandoned);
        session.AbandonedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_WhenSessionBelongsToOtherPlayer_ReturnsForbid()
    {
        // Arrange
        await using var db = CreateDbContext();
        await SeedAsync(db);

        var command = new AbandonSessionCommand(Guid.NewGuid(), SessionId: 1);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(403);

        var session = await db.GameSessions.FindAsync(1);
        session!.Status.Should().Be(SessionStatus.Pending, "statut inchangé");
    }

    [Fact]
    public async Task Handle_WhenSessionAlreadyCompleted_ReturnsBadRequest()
    {
        // Arrange
        await using var db = CreateDbContext();
        await SeedAsync(db, SessionStatus.Completed);

        var command = new AbandonSessionCommand(PlayerId, SessionId: 1);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
    }

    [Fact]
    public async Task Handle_WhenSessionNotFound_Returns404()
    {
        // Arrange
        await using var db = CreateDbContext();

        var command = new AbandonSessionCommand(PlayerId, SessionId: 999);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status404NotFound);
    }
}
