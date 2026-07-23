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

    private static SettingsService CreateSettingsService() =>
        new(Options.Create(new AppSettings()));

    private static SubmitAnswerHandler CreateHandler(ApplicationDbContext db) =>
        new(db, new ScoreCalculator(), new TextNormalizer(), CreateSettingsService());

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

    private static GameSession BuildSession(int id = 1, int challengeId = 1, SessionStatus status = SessionStatus.Pending) => new()
    {
        Id                   = id,
        PlayerId             = FakePlayerId,
        DailyChallengeId     = challengeId,
        TotalScore           = 0,
        TotalDurationSeconds = 0,
        CreatedAt            = DateTime.UtcNow,
        Status               = status,
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
        response.Score.Should().Be(400); // 3s = 400, ×1.0
        response.ListenedDurationSeconds.Should().Be(3);
        response.AverageSecondsWhenCorrect.Should().Be(3);
        response.FailureRatePercent.Should().Be(0); // seul joueur, a trouvé

        var updatedSession = await db.GameSessions.FindAsync(session.Id);
        updatedSession!.TotalScore.Should().Be(400);
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
        response.Score.Should().Be(200); // 400 × 0.5
        response.AverageSecondsWhenCorrect.Should().Be(3);
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
        response.Score.Should().Be(200); // 400 × 0.5
        response.AverageSecondsWhenCorrect.Should().Be(3);
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
        response.ListenedDurationSeconds.Should().Be(3);
        response.AverageSecondsWhenCorrect.Should().BeNull();
        response.FailureRatePercent.Should().Be(100); // seul joueur, n'a pas trouvé
    }

    [Fact]
    public async Task Handle_WhenExtended_ScoresOnFinalDurationWithoutPenalty()
    {
        // Arrange — palier final 5s après prolongation depuis 3s : pas de malus,
        // le score ne dépend que du palier finalement écouté.
        await using var db = CreateDbContext();
        await SeedAsync(db);
        var command = BuildCommand(duration: 5, wasExtended: true, artist: "Daft Punk", title: "Get Lucky");

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var response = AssertOk<SubmitAnswerResponse>(result).Value!;
        response.Score.Should().Be(250); // 5s = 250, aucun malus de prolongation
        response.AverageSecondsWhenCorrect.Should().Be(5);

        var stored = await db.GameSessionAnswers.SingleAsync(a => a.GameSessionId == 1);
        stored.WasExtended.Should().BeTrue(); // conservé pour les stats admin, sans effet sur le score
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
    public async Task Handle_WhenDurationIsZero_ReturnsZeroScore()
    {
        // Arrange — skip d'un morceau sans preview
        await using var db = CreateDbContext();
        await SeedAsync(db);
        var command = BuildCommand(duration: 0, wasExtended: false, artist: null, title: null);

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        var response = AssertOk<SubmitAnswerResponse>(result).Value!;
        response.Score.Should().Be(0);
        response.ArtistCorrect.Should().BeFalse();
        response.TitleCorrect.Should().BeFalse();
        response.ListenedDurationSeconds.Should().Be(0);
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
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(403);
    }

    [Fact]
    public async Task Handle_WhenSessionAbandoned_ReturnsForbid()
    {
        // Arrange
        await using var db = CreateDbContext();
        db.Players.Add(BuildPlayer());
        var (challenge, _) = BuildChallengeWithTrack();
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();

        var session = BuildSession(status: SessionStatus.Abandoned);
        db.GameSessions.Add(session);
        await db.SaveChangesAsync();

        var command = BuildCommand();

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(403);
    }

    [Fact]
    public async Task Handle_WhenLastAnswer_MarksSessionCompleted()
    {
        // Arrange — challenge à 1 track (TracksPerChallenge par défaut = 3 dans AppSettings mais on simule 1 track répondue)
        // On utilise AppSettings avec TracksPerChallenge = 1 pour simplifier
        await using var db = CreateDbContext();
        db.Players.Add(BuildPlayer());
        var (challenge, _) = BuildChallengeWithTrack();
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();

        var session = BuildSession();
        db.GameSessions.Add(session);
        await db.SaveChangesAsync();

        var settings = new AppSettings { TracksPerChallenge = 1 };
        var handler = new SubmitAnswerHandler(db, new ScoreCalculator(), new TextNormalizer(), new SettingsService(Options.Create(settings)));
        var command = BuildCommand(duration: 1, artist: "Daft Punk", title: "Get Lucky");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeOfType<Ok<SubmitAnswerResponse>>();

        var updatedSession = await db.GameSessions.FindAsync(session.Id);
        updatedSession!.Status.Should().Be(SessionStatus.Completed);
        updatedSession.CompletedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_WhenCompletingYesterdaysChallengeAfterMidnight_ContinuesStreak()
    {
        // Arrange — piège 18 : la streak se base sur la date du défi, pas la date de complétion.
        // Défi daté d'hier, dernier défi joué avant-hier → continuation même si on termine "aujourd'hui".
        await using var db = CreateDbContext();
        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);

        var player = BuildPlayer();
        player.CurrentStreak  = 5;
        player.LastPlayedDate = yesterday.AddDays(-1);
        db.Players.Add(player);

        var (challenge, _) = BuildChallengeWithTrack();
        challenge.Date = yesterday;
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();

        db.GameSessions.Add(BuildSession());
        await db.SaveChangesAsync();

        var settings = new AppSettings { TracksPerChallenge = 1 };
        var handler = new SubmitAnswerHandler(db, new ScoreCalculator(), new TextNormalizer(), new SettingsService(Options.Create(settings)));

        // Act
        await handler.Handle(BuildCommand(duration: 1), CancellationToken.None);

        // Assert
        var updatedPlayer = await db.Players.FindAsync(FakePlayerId);
        updatedPlayer!.CurrentStreak.Should().Be(6);
        updatedPlayer.LastPlayedDate.Should().Be(yesterday);
    }

    [Fact]
    public async Task Handle_WhenGapSinceLastChallenge_ResetsStreakToOne()
    {
        // Arrange — dernier défi joué il y a 3 jours → la streak repart à 1
        await using var db = CreateDbContext();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var player = BuildPlayer();
        player.CurrentStreak  = 5;
        player.LastPlayedDate = today.AddDays(-3);
        db.Players.Add(player);

        var (challenge, _) = BuildChallengeWithTrack();
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();

        db.GameSessions.Add(BuildSession());
        await db.SaveChangesAsync();

        var settings = new AppSettings { TracksPerChallenge = 1 };
        var handler = new SubmitAnswerHandler(db, new ScoreCalculator(), new TextNormalizer(), new SettingsService(Options.Create(settings)));

        // Act
        await handler.Handle(BuildCommand(duration: 1), CancellationToken.None);

        // Assert
        var updatedPlayer = await db.Players.FindAsync(FakePlayerId);
        updatedPlayer!.CurrentStreak.Should().Be(1);
        updatedPlayer.LastPlayedDate.Should().Be(today);
    }

    [Fact]
    public async Task Handle_WhenNotLastAnswer_StatusRemainsActive()
    {
        // Arrange — TracksPerChallenge = 3 (défaut), on soumet seulement 1 réponse
        await using var db = CreateDbContext();
        await SeedAsync(db);
        var command = BuildCommand(duration: 1, artist: "Daft Punk", title: "Get Lucky");

        // Act
        var result = await CreateHandler(db).Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeOfType<Ok<SubmitAnswerResponse>>();

        var session = await db.GameSessions.FindAsync(1);
        session!.Status.Should().Be(SessionStatus.Pending);
        session.CompletedAt.Should().BeNull();
    }
}
