using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Scoring;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Common.Text;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.UnitTests.Features.Sessions.SubmitAnswer;

public sealed class SubmitAnswerHandlerTests
{
    private static readonly Guid FakePlayerId = new("11111111-1111-1111-1111-111111111111");

    // ---------------------------------------------------------------------------
    // Fixture
    // ---------------------------------------------------------------------------

    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static SettingsService CreateSettingsService(ApplicationDbContext db)
    {
        var cache = new MemoryCache(Options.Create(new MemoryCacheOptions()));
        db.Settings.AddRange(
            new Setting { Id = 1, Key = "GuessTimerSeconds",       Value = "20",                         UpdatedAt = DateTime.UtcNow },
            new Setting { Id = 2, Key = "AllowedDurationsSeconds",  Value = "1,2,3,5,10,15,30",           UpdatedAt = DateTime.UtcNow },
            new Setting { Id = 3, Key = "MaxExtensionsPerAnswer",   Value = "1",                          UpdatedAt = DateTime.UtcNow },
            new Setting { Id = 4, Key = "TracksPerChallenge",       Value = "10",                         UpdatedAt = DateTime.UtcNow },
            new Setting { Id = 5, Key = "DurationScores",           Value = "1:1000,2:850,3:700,5:500,10:300,15:150,30:50", UpdatedAt = DateTime.UtcNow }
        );
        db.SaveChanges();
        return new SettingsService(db, cache);
    }

    private static SubmitAnswerHandler CreateHandler(ApplicationDbContext db) =>
        new(db, new ScoreCalculator(), new TextNormalizer(), CreateSettingsService(db));

    // ---------------------------------------------------------------------------
    // Builders
    // ---------------------------------------------------------------------------

    private static Player BuildPlayer() => new()
    {
        Id        = FakePlayerId,
        IsGuest   = true,
        AuthToken = Guid.NewGuid(),
        CreatedAt = DateTime.UtcNow,
        IsDeleted = false,
    };

    private static (DailyChallenge challenge, DailyChallengeTrack challengeTrack) BuildChallengeWithTrack(
        string artist = "Daft Punk",
        string title  = "Get Lucky")
    {
        var track = new Track
        {
            Id            = 1,
            DeezerTrackId = 916424,
            Artist        = artist,
            Title         = title,
            CreatedAt     = DateTime.UtcNow,
        };

        var challengeTrack = new DailyChallengeTrack
        {
            Id                 = 1,
            DailyChallengeId   = 1,
            TrackId            = 1,
            Position           = 1,
            DeezerRankSnapshot = 1,
            Track              = track,
        };

        var challenge = new DailyChallenge
        {
            Id     = 1,
            Date   = DateOnly.FromDateTime(DateTime.UtcNow),
            Seed   = 42,
            Tracks = [challengeTrack],
        };

        return (challenge, challengeTrack);
    }

    private static GameSession BuildSession(int id = 1, int challengeId = 1) => new()
    {
        Id                   = id,
        PlayerId             = FakePlayerId,
        DailyChallengeId     = challengeId,
        TotalScore           = 0,
        TotalDurationSeconds = 0,
        CreatedAt            = DateTime.UtcNow,
    };

    private static async Task<(GameSession session, DailyChallengeTrack challengeTrack)> SeedAsync(
        ApplicationDbContext db,
        string artist = "Daft Punk",
        string title  = "Get Lucky")
    {
        db.Players.Add(BuildPlayer());
        var (challenge, challengeTrack) = BuildChallengeWithTrack(artist, title);
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();

        var session = BuildSession();
        db.GameSessions.Add(session);
        await db.SaveChangesAsync();

        return (session, challengeTrack);
    }

    private static SubmitAnswerCommand BuildCommand(
        Guid? playerId            = null,
        int sessionId             = 1,
        int dailyChallengeTrackId = 1,
        int duration              = 3,
        bool wasExtended          = false,
        string? artist            = "Daft Punk",
        string? title             = "Get Lucky") =>
        new(playerId ?? FakePlayerId, sessionId, dailyChallengeTrackId, duration, wasExtended, artist, title);

    // ---------------------------------------------------------------------------
    // Helpers assertion IResult
    // ---------------------------------------------------------------------------

    private static Ok<T> AssertOk<T>(IResult result)
    {
        result.Should().BeOfType<Ok<T>>();
        return (Ok<T>)result;
    }

    private static void AssertNotFound(IResult result) =>
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status404NotFound);

    private static void AssertConflict(IResult result) =>
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status409Conflict);

    // ---------------------------------------------------------------------------
    // Tests
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task Handle_WhenBothCorrect_ReturnsFullScore()
    {
        // Arrange
        await using var db = CreateDbContext();
        var (session, _) = await SeedAsync(db);
        var command = BuildCommand(duration: 3, wasExtended: false, artist: "Daft Punk", title: "Get Lucky");

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var response = AssertOk<SubmitAnswerResponse>(result).Value!;
        response.ArtistCorrect.Should().BeTrue();
        response.TitleCorrect.Should().BeTrue();
        response.Score.Should().Be(700); // 3s = 700, ×1.0

        var updatedSession = await db.GameSessions.FindAsync(session.Id);
        updatedSession!.TotalScore.Should().Be(700);
        updatedSession.TotalDurationSeconds.Should().Be(3);
    }

    [Fact]
    public async Task Handle_WhenOnlyArtistCorrect_ReturnsHalfScore()
    {
        // Arrange
        await using var db = CreateDbContext();
        await SeedAsync(db);
        var command = BuildCommand(duration: 3, wasExtended: false, artist: "Daft Punk", title: "mauvais titre");

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var response = AssertOk<SubmitAnswerResponse>(result).Value!;
        response.ArtistCorrect.Should().BeTrue();
        response.TitleCorrect.Should().BeFalse();
        response.Score.Should().Be(350); // 700 × 0.5
    }

    [Fact]
    public async Task Handle_WhenOnlyTitleCorrect_ReturnsHalfScore()
    {
        // Arrange
        await using var db = CreateDbContext();
        await SeedAsync(db);
        var command = BuildCommand(duration: 3, wasExtended: false, artist: "mauvais artiste", title: "Get Lucky");

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var response = AssertOk<SubmitAnswerResponse>(result).Value!;
        response.ArtistCorrect.Should().BeFalse();
        response.TitleCorrect.Should().BeTrue();
        response.Score.Should().Be(350); // 700 × 0.5
    }

    [Fact]
    public async Task Handle_WhenNoneCorrect_ReturnsZero()
    {
        // Arrange
        await using var db = CreateDbContext();
        await SeedAsync(db);
        var command = BuildCommand(duration: 3, wasExtended: false, artist: "mauvais", title: "mauvais");

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var response = AssertOk<SubmitAnswerResponse>(result).Value!;
        response.Score.Should().Be(0);
        response.CorrectArtist.Should().Be("Daft Punk");
        response.CorrectTitle.Should().Be("Get Lucky");
    }

    [Fact]
    public async Task Handle_WhenExtended_AppliesPenalty()
    {
        // Arrange — palier final 5s après prolongation depuis 3s
        await using var db = CreateDbContext();
        await SeedAsync(db);
        var command = BuildCommand(duration: 5, wasExtended: true, artist: "Daft Punk", title: "Get Lucky");

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var response = AssertOk<SubmitAnswerResponse>(result).Value!;
        response.Score.Should().Be(375); // 500 × 0.75 = 375
    }

    [Fact]
    public async Task Handle_WhenSessionNotFound_Returns404()
    {
        // Arrange
        await using var db = CreateDbContext();
        var command = BuildCommand(sessionId: 999);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        AssertNotFound(result);
    }

    [Fact]
    public async Task Handle_WhenAlreadyAnswered_Returns409()
    {
        // Arrange
        await using var db = CreateDbContext();
        var (session, challengeTrack) = await SeedAsync(db);

        db.GameSessionAnswers.Add(new GameSessionAnswer
        {
            GameSessionId           = session.Id,
            DailyChallengeTrackId   = challengeTrack.Id,
            ListenedDurationSeconds = 3,
            WasExtended             = false,
            ArtistCorrect           = true,
            TitleCorrect            = true,
            Score                   = 700,
        });
        await db.SaveChangesAsync();

        // Act — deuxième tentative sur la même track
        var command = BuildCommand();
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        AssertConflict(result);
    }

    [Fact]
    public async Task Handle_WhenSessionBelongsToOtherPlayer_ReturnsForbid()
    {
        // Arrange
        await using var db = CreateDbContext();
        await SeedAsync(db); // session créée pour FakePlayerId

        var otherPlayerId = Guid.NewGuid();
        var command = BuildCommand(playerId: otherPlayerId);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeOfType<ForbidHttpResult>();
    }
}
