using FluentAssertions;
using Xunit;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.ResetToday;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.UnitTests.Features.Admin;

public sealed class ResetTodayHandlerTests
{
    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static readonly Guid Player1 = new("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Player2 = new("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Handle_WhenNoChallengeToday_Returns404()
    {
        await using var db = CreateDbContext();
        // Défi d'hier seulement
        db.DailyChallenges.Add(new DailyChallenge
        {
            Id   = 1,
            Date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1),
            Seed = 1,
        });
        await db.SaveChangesAsync();

        var result = await new ResetTodayHandler(db).Handle(new ResetTodayCommand(), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status404NotFound);
    }

    [Fact]
    public async Task Handle_WhenChallengeExistsWithSessions_DeletesSessionsAndReturns200()
    {
        await using var db = CreateDbContext();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        db.DailyChallenges.Add(new DailyChallenge { Id = 1, Date = today, Seed = 1 });
        db.Players.AddRange(
            new Player { Id = Player1, IsGuest = true, AuthToken = Guid.NewGuid(), CreatedAt = DateTime.UtcNow },
            new Player { Id = Player2, IsGuest = true, AuthToken = Guid.NewGuid(), CreatedAt = DateTime.UtcNow });
        db.GameSessions.AddRange(
            new GameSession { Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 500, TotalDurationSeconds = 3, CreatedAt = DateTime.UtcNow },
            new GameSession { Id = 2, PlayerId = Player2, DailyChallengeId = 1, TotalScore = 300, TotalDurationSeconds = 5, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var result = await new ResetTodayHandler(db).Handle(new ResetTodayCommand(), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status200OK);
        (await db.GameSessions.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Handle_WhenChallengeExistsWithNoSessions_Returns200WithDeletedZero()
    {
        await using var db = CreateDbContext();
        db.DailyChallenges.Add(new DailyChallenge
        {
            Id   = 1,
            Date = DateOnly.FromDateTime(DateTime.UtcNow),
            Seed = 1,
        });
        await db.SaveChangesAsync();

        var result = await new ResetTodayHandler(db).Handle(new ResetTodayCommand(), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status200OK);
        (await db.GameSessions.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Handle_OnlyDeletesSessionsForTodayChallenge_NotOtherDays()
    {
        await using var db = CreateDbContext();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        db.DailyChallenges.AddRange(
            new DailyChallenge { Id = 1, Date = today, Seed = 1 },
            new DailyChallenge { Id = 2, Date = today.AddDays(-1), Seed = 2 });
        db.Players.Add(new Player { Id = Player1, IsGuest = true, AuthToken = Guid.NewGuid(), CreatedAt = DateTime.UtcNow });
        db.GameSessions.AddRange(
            new GameSession { Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 100, TotalDurationSeconds = 1, CreatedAt = DateTime.UtcNow },
            new GameSession { Id = 2, PlayerId = Player1, DailyChallengeId = 2, TotalScore = 200, TotalDurationSeconds = 2, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();

        await new ResetTodayHandler(db).Handle(new ResetTodayCommand(), CancellationToken.None);

        var remaining = await db.GameSessions.ToListAsync();
        remaining.Should().ContainSingle()
            .Which.DailyChallengeId.Should().Be(2, "la session d'hier ne doit pas être supprimée");
    }
}
