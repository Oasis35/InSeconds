using System.Net;
using System.Text;
using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.UnitTests.Features.Sessions.StartSession;

public sealed class StartSessionHandlerTests
{
    private static readonly Guid PlayerId = new("11111111-1111-1111-1111-111111111111");

    private static DeezerClient CreateFakeDeezerClient()
    {
        var handler = new FakeHttpMessageHandler(
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """{"preview":"https://fake-preview.mp3"}""",
                    Encoding.UTF8, "application/json"),
            });
        return new DeezerClient(new HttpClient(handler) { BaseAddress = new Uri("https://api.deezer.com") });
    }

    private sealed class FakeHttpMessageHandler(HttpResponseMessage response) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(response);
    }

    // ---------------------------------------------------------------------------
    // Fixture
    // ---------------------------------------------------------------------------

    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static SettingsService CreateSettingsService() =>
        new(Options.Create(new AppSettings()));

    // ---------------------------------------------------------------------------
    // Builders
    // ---------------------------------------------------------------------------

    private static Player BuildPlayer() => new()
    {
        Id        = PlayerId,
        IsGuest   = true,
        AuthToken = Guid.NewGuid(),
        CreatedAt = DateTime.UtcNow,
        IsDeleted = false,
    };

    private static DailyChallenge BuildTodayChallenge(int id = 1, int trackCount = 10)
    {
        var tracks = Enumerable.Range(1, trackCount)
            .Select(i => new Track
            {
                Id            = i,
                DeezerTrackId = 1000L + i,
                Artist        = $"Artist {i}",
                Title         = $"Title {i}",
                CreatedAt     = DateTime.UtcNow,
            })
            .ToList();

        var challengeTracks = tracks
            .Select((t, idx) => new DailyChallengeTrack
            {
                Id                 = idx + 1,
                DailyChallengeId   = id,
                TrackId            = t.Id,
                Position           = idx + 1,
                DeezerRankSnapshot = idx + 1,
                Track              = t,
            })
            .ToList();

        return new DailyChallenge
        {
            Id     = id,
            Date   = DateOnly.FromDateTime(DateTime.UtcNow),
            Seed   = 42,
            Tracks = challengeTracks,
        };
    }

    private static GameSession BuildGameSession(Guid playerId, int challengeId, int id = 99) => new()
    {
        Id                   = id,
        PlayerId             = playerId,
        DailyChallengeId     = challengeId,
        TotalScore           = 0,
        TotalDurationSeconds = 0,
        CreatedAt            = DateTime.UtcNow,
    };

    // ---------------------------------------------------------------------------
    // Helpers assertion IResult
    // ---------------------------------------------------------------------------

    private static Ok<T> AssertOk<T>(IResult result)
    {
        result.Should().BeOfType<Ok<T>>();
        return (Ok<T>)result;
    }

    private static void AssertConflict(IResult result) =>
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status409Conflict);

    private static void AssertProblem(IResult result, int expectedStatusCode)
    {
        result.Should().BeOfType<ProblemHttpResult>();
        ((ProblemHttpResult)result).StatusCode.Should().Be(expectedStatusCode);
    }

    // ---------------------------------------------------------------------------
    // Tests
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task Handle_WhenPlayerAndChallengeExistAndNotPlayed_Returns200WithOrderedTracks()
    {
        // Arrange
        await using var db = CreateDbContext();
        db.Players.Add(BuildPlayer());
        db.DailyChallenges.Add(BuildTodayChallenge(id: 1, trackCount: 10));
        await db.SaveChangesAsync();

        // Act
        var result = await new StartSessionHandler(db, CreateFakeDeezerClient(), CreateSettingsService()).Handle(new StartSessionCommand(PlayerId), CancellationToken.None);

        // Assert
        var response = AssertOk<StartSessionResponse>(result).Value!;
        response.SessionId.Should().BeGreaterThan(0);
        response.Tracks.Should().HaveCount(10);
        response.Tracks.Should().BeInAscendingOrder(t => t.Position);
        response.Tracks.Select(t => t.Position).Should().Equal(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

        (await db.GameSessions.ToListAsync()).Should().ContainSingle()
            .Which.DailyChallengeId.Should().Be(1);
    }

    [Fact]
    public async Task Handle_WhenAlreadyPlayed_Returns409Conflict()
    {
        // Arrange
        await using var db = CreateDbContext();
        db.Players.Add(BuildPlayer());
        db.DailyChallenges.Add(BuildTodayChallenge(id: 1));
        await db.SaveChangesAsync();

        db.GameSessions.Add(BuildGameSession(PlayerId, challengeId: 1));
        await db.SaveChangesAsync();

        // Act
        var result = await new StartSessionHandler(db, CreateFakeDeezerClient(), CreateSettingsService()).Handle(new StartSessionCommand(PlayerId), CancellationToken.None);

        // Assert
        AssertConflict(result);
        (await db.GameSessions.ToListAsync()).Should().ContainSingle("aucune nouvelle session créée");
    }

    [Fact]
    public async Task Handle_WhenNoChallengeForToday_Returns503()
    {
        // Arrange
        await using var db = CreateDbContext();
        db.Players.Add(BuildPlayer());
        db.DailyChallenges.Add(new DailyChallenge
        {
            Id   = 1,
            Date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1),
            Seed = 1,
        });
        await db.SaveChangesAsync();

        // Act
        var result = await new StartSessionHandler(db, CreateFakeDeezerClient(), CreateSettingsService()).Handle(new StartSessionCommand(PlayerId), CancellationToken.None);

        // Assert
        AssertProblem(result, StatusCodes.Status503ServiceUnavailable);
    }
}
