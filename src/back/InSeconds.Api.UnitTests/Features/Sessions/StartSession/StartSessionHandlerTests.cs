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
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.UnitTests.Features.Sessions.StartSession;

public sealed class StartSessionHandlerTests
{
    private static readonly Guid PlayerId = new("11111111-1111-1111-1111-111111111111");

    private static CachedDeezerClient CreateFakeDeezerClient()
    {
        var handler = new FakeHttpMessageHandler(
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """{"preview":"https://fake-preview.mp3"}""",
                    Encoding.UTF8, "application/json"),
            });
        var client = new DeezerClient(new HttpClient(handler) { BaseAddress = new Uri("https://api.deezer.com") }, NullLogger<DeezerClient>.Instance);
        return new CachedDeezerClient(client, new MemoryCache(new MemoryCacheOptions()));
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

    private static GameSession BuildGameSession(Guid playerId, int challengeId, int id = 99, SessionStatus status = SessionStatus.Completed) => new()
    {
        Id                   = id,
        PlayerId             = playerId,
        DailyChallengeId     = challengeId,
        TotalScore           = 0,
        TotalDurationSeconds = 0,
        CreatedAt            = DateTime.UtcNow,
        Status               = status,
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
        response.Tracks.Should().AllSatisfy(t => t.DeezerTrackId.Should().BeGreaterThan(0));
        response.IsResuming.Should().BeFalse();
        response.ResumeFromPosition.Should().Be(0);
        response.CompletedAnswers.Should().BeEmpty();

        var session = await db.GameSessions.SingleAsync();
        session.DailyChallengeId.Should().Be(1);
        session.Status.Should().Be(SessionStatus.Pending);
    }

    [Fact]
    public async Task Handle_WhenSessionCompleted_Returns409()
    {
        // Arrange
        await using var db = CreateDbContext();
        db.Players.Add(BuildPlayer());
        db.DailyChallenges.Add(BuildTodayChallenge(id: 1));
        await db.SaveChangesAsync();

        db.GameSessions.Add(BuildGameSession(PlayerId, challengeId: 1, status: SessionStatus.Completed));
        await db.SaveChangesAsync();

        // Act
        var result = await new StartSessionHandler(db, CreateFakeDeezerClient(), CreateSettingsService()).Handle(new StartSessionCommand(PlayerId), CancellationToken.None);

        // Assert
        AssertConflict(result);
        (await db.GameSessions.ToListAsync()).Should().ContainSingle("aucune nouvelle session créée");
    }

    [Fact]
    public async Task Handle_WhenSessionAbandoned_Returns409()
    {
        // Arrange
        await using var db = CreateDbContext();
        db.Players.Add(BuildPlayer());
        db.DailyChallenges.Add(BuildTodayChallenge(id: 1));
        await db.SaveChangesAsync();

        db.GameSessions.Add(BuildGameSession(PlayerId, challengeId: 1, status: SessionStatus.Abandoned));
        await db.SaveChangesAsync();

        // Act
        var result = await new StartSessionHandler(db, CreateFakeDeezerClient(), CreateSettingsService()).Handle(new StartSessionCommand(PlayerId), CancellationToken.None);

        // Assert
        AssertConflict(result);
        (await db.GameSessions.ToListAsync()).Should().ContainSingle("aucune nouvelle session créée");
    }

    [Fact]
    public async Task Handle_WhenSessionPending_ReturnsResumeResponse()
    {
        // Arrange
        await using var db = CreateDbContext();
        var player = BuildPlayer();
        db.Players.Add(player);
        var challenge = BuildTodayChallenge(id: 1, trackCount: 3);
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();

        var session = BuildGameSession(PlayerId, challengeId: 1, id: 10, status: SessionStatus.Pending);
        db.GameSessions.Add(session);
        await db.SaveChangesAsync();

        // Simuler une réponse déjà soumise (position 1)
        db.GameSessionAnswers.Add(new GameSessionAnswer
        {
            GameSessionId           = session.Id,
            DailyChallengeTrackId   = challenge.Tracks.First(t => t.Position == 1).Id,
            ListenedDurationSeconds = 1,
            WasExtended             = false,
            ArtistCorrect           = true,
            TitleCorrect            = false,
            Score                   = 425,
        });
        await db.SaveChangesAsync();

        // Act
        var result = await new StartSessionHandler(db, CreateFakeDeezerClient(), CreateSettingsService()).Handle(new StartSessionCommand(PlayerId), CancellationToken.None);

        // Assert
        var response = AssertOk<StartSessionResponse>(result).Value!;
        response.SessionId.Should().Be(session.Id);
        response.IsResuming.Should().BeTrue();
        response.ResumeFromPosition.Should().Be(1); // index 0-based de la 2ème track
        response.CompletedAnswers.Should().ContainSingle();
        response.CompletedAnswers[0].Position.Should().Be(1);
        response.CompletedAnswers[0].ArtistCorrect.Should().BeTrue();

        (await db.GameSessions.ToListAsync()).Should().ContainSingle("aucune nouvelle session créée");
    }

    [Fact]
    public async Task Handle_WhenPendingSessionFromPreviousDay_MarksAbandonedAndCreatesNew()
    {
        // Arrange
        await using var db = CreateDbContext();
        db.Players.Add(BuildPlayer());

        // Défi d'hier
        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);
        var oldChallenge = new DailyChallenge { Id = 1, Date = yesterday, Seed = 1, Tracks = [] };
        db.DailyChallenges.Add(oldChallenge);
        await db.SaveChangesAsync();

        var oldSession = new GameSession
        {
            PlayerId             = PlayerId,
            DailyChallengeId     = oldChallenge.Id,
            TotalScore           = 0,
            TotalDurationSeconds = 0,
            CreatedAt            = DateTime.UtcNow.AddDays(-1),
            Status               = SessionStatus.Pending,
        };
        db.GameSessions.Add(oldSession);

        // Défi d'aujourd'hui
        var todayChallenge = BuildTodayChallenge(id: 2, trackCount: 3);
        db.DailyChallenges.Add(todayChallenge);
        await db.SaveChangesAsync();

        // Act
        var result = await new StartSessionHandler(db, CreateFakeDeezerClient(), CreateSettingsService()).Handle(new StartSessionCommand(PlayerId), CancellationToken.None);

        // Assert
        var sessions = await db.GameSessions.ToListAsync();
        sessions.Should().HaveCount(2, "l'ancienne session + la nouvelle");

        var expired = sessions.First(s => s.DailyChallengeId == oldChallenge.Id);
        expired.Status.Should().Be(SessionStatus.Abandoned);
        expired.AbandonedAt.Should().NotBeNull();

        var newSession = sessions.First(s => s.DailyChallengeId == todayChallenge.Id);
        newSession.Status.Should().Be(SessionStatus.Pending);

        AssertOk<StartSessionResponse>(result).Value!.IsResuming.Should().BeFalse();
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
