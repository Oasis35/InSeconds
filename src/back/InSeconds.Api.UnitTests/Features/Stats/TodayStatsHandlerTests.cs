using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Stats.Today;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.UnitTests.Features.Stats;

public sealed class TodayStatsHandlerTests
{
    private static readonly Guid Player1 = new("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Player2 = new("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Player3 = new("33333333-3333-3333-3333-333333333333");

    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static TodayStatsHandler CreateHandler(ApplicationDbContext db) =>
        new(db, new SettingsService(Options.Create(new AppSettings())));

    private static Player BuildPlayer(Guid id) => new()
    {
        Id = id, IsGuest = true, AuthToken = Guid.NewGuid(), CreatedAt = DateTime.UtcNow,
    };

    private static (DailyChallenge challenge, DailyChallengeTrack challengeTrack) BuildTodayChallenge()
    {
        var track = new Track
        {
            Id = 1, DeezerTrackId = 1001, Artist = "Daft Punk", Title = "Get Lucky", CreatedAt = DateTime.UtcNow,
        };
        var challengeTrack = new DailyChallengeTrack
        {
            Id = 1, DailyChallengeId = 1, TrackId = 1, Position = 1, DeezerRankSnapshot = 1, Track = track,
        };
        return (new DailyChallenge { Id = 1, Date = DateOnly.FromDateTime(DateTime.UtcNow), Seed = 42, Tracks = [challengeTrack] }, challengeTrack);
    }

    // ---------------------------------------------------------------------------
    // Tests — pas de défi
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task Handle_WhenNoChallengeToday_ReturnsEmptyResponse()
    {
        await using var db = CreateDbContext();

        var result = await CreateHandler(db).Handle(null, CancellationToken.None);

        result.Should().BeOfType<Ok<TodayStatsResponse>>();
        var response = ((Ok<TodayStatsResponse>)result).Value!;
        response.YourScore.Should().BeNull();
        response.MedianScore.Should().Be(0);
        response.TotalPlayers.Should().Be(0);
        response.Tracks.Should().BeEmpty();
    }

    // ---------------------------------------------------------------------------
    // Tests — scores et médiane
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task Handle_WhenNoSessions_ReturnsTotalPlayersZeroAndMedianZero()
    {
        await using var db = CreateDbContext();
        var (challenge, _) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(null, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        response.TotalPlayers.Should().Be(0);
        response.MedianScore.Should().Be(0);
    }

    [Fact]
    public async Task Handle_WithOddNumberOfSessions_ReturnsCorrectMedian()
    {
        // scores : 100, 300, 500 → médiane = 300
        await using var db = CreateDbContext();
        var (challenge, _) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        db.Players.AddRange(BuildPlayer(Player1), BuildPlayer(Player2), BuildPlayer(Player3));
        db.GameSessions.AddRange(
            new GameSession { Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 100, TotalDurationSeconds = 3, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed },
            new GameSession { Id = 2, PlayerId = Player2, DailyChallengeId = 1, TotalScore = 500, TotalDurationSeconds = 2, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed },
            new GameSession { Id = 3, PlayerId = Player3, DailyChallengeId = 1, TotalScore = 300, TotalDurationSeconds = 5, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed });
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(null, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        response.TotalPlayers.Should().Be(3);
        response.MedianScore.Should().Be(300);
    }

    [Fact]
    public async Task Handle_WithEvenNumberOfSessions_ReturnsAverageOfTwoMiddleValues()
    {
        // scores : 100, 200, 300, 400 → médiane = (200+300)/2 = 250
        await using var db = CreateDbContext();
        var (challenge, _) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        var player4 = new Guid("44444444-4444-4444-4444-444444444444");
        db.Players.AddRange(BuildPlayer(Player1), BuildPlayer(Player2), BuildPlayer(Player3), BuildPlayer(player4));
        db.GameSessions.AddRange(
            new GameSession { Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 400, TotalDurationSeconds = 1, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed },
            new GameSession { Id = 2, PlayerId = Player2, DailyChallengeId = 1, TotalScore = 100, TotalDurationSeconds = 5, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed },
            new GameSession { Id = 3, PlayerId = Player3, DailyChallengeId = 1, TotalScore = 300, TotalDurationSeconds = 2, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed },
            new GameSession { Id = 4, PlayerId = player4, DailyChallengeId = 1, TotalScore = 200, TotalDurationSeconds = 3, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed });
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(null, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        response.MedianScore.Should().Be(250);
    }

    // ---------------------------------------------------------------------------
    // Tests — score du joueur connecté
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task Handle_WhenPlayerHasPlayed_ReturnsTheirScore()
    {
        await using var db = CreateDbContext();
        var (challenge, _) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        db.Players.Add(BuildPlayer(Player1));
        db.GameSessions.Add(new GameSession
        {
            Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 850, TotalDurationSeconds = 1, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed,
        });
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(Player1, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        response.YourScore.Should().Be(850);
    }

    [Fact]
    public async Task Handle_WhenPlayerHasNotPlayed_ReturnsYourScoreNull()
    {
        await using var db = CreateDbContext();
        var (challenge, _) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        db.Players.Add(BuildPlayer(Player1));
        db.GameSessions.Add(new GameSession
        {
            Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 500, TotalDurationSeconds = 2, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed,
        });
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(Player2, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        response.YourScore.Should().BeNull();
    }

    // ---------------------------------------------------------------------------
    // Tests — stats par track
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task Handle_WhenNoAnswers_ReturnsTrackWithZeroFailureRate()
    {
        await using var db = CreateDbContext();
        var (challenge, _) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(null, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        response.Tracks.Should().ContainSingle();
        var track = response.Tracks[0];
        track.Position.Should().Be(1);
        track.Artist.Should().Be("Daft Punk");
        track.FailureRatePercent.Should().Be(0);
        track.AverageSecondsWhenCorrect.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenAllAnswersCorrect_ReturnsFailureRateZero()
    {
        await using var db = CreateDbContext();
        var (challenge, challengeTrack) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        db.Players.AddRange(BuildPlayer(Player1), BuildPlayer(Player2));
        db.GameSessions.AddRange(
            new GameSession { Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 400, TotalDurationSeconds = 3, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed },
            new GameSession { Id = 2, PlayerId = Player2, DailyChallengeId = 1, TotalScore = 400, TotalDurationSeconds = 3, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed });
        db.GameSessionAnswers.AddRange(
            new GameSessionAnswer { Id = 1, GameSessionId = 1, DailyChallengeTrackId = challengeTrack.Id, ListenedDurationSeconds = 3, ArtistCorrect = true, TitleCorrect = true, Score = 400 },
            new GameSessionAnswer { Id = 2, GameSessionId = 2, DailyChallengeTrackId = challengeTrack.Id, ListenedDurationSeconds = 5, ArtistCorrect = true, TitleCorrect = true, Score = 250 });
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(null, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        var track = response.Tracks[0];
        track.FailureRatePercent.Should().Be(0);
        track.AverageSecondsWhenCorrect.Should().Be(4.0); // (3+5)/2
    }

    [Fact]
    public async Task Handle_WhenHalfAnswersCorrect_Returns50PercentFailureRate()
    {
        await using var db = CreateDbContext();
        var (challenge, challengeTrack) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        db.Players.AddRange(BuildPlayer(Player1), BuildPlayer(Player2));
        db.GameSessions.AddRange(
            new GameSession { Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 400, TotalDurationSeconds = 3, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed },
            new GameSession { Id = 2, PlayerId = Player2, DailyChallengeId = 1, TotalScore = 0, TotalDurationSeconds = 3, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed });
        db.GameSessionAnswers.AddRange(
            new GameSessionAnswer { Id = 1, GameSessionId = 1, DailyChallengeTrackId = challengeTrack.Id, ListenedDurationSeconds = 3, ArtistCorrect = true, TitleCorrect = true, Score = 400 },
            new GameSessionAnswer { Id = 2, GameSessionId = 2, DailyChallengeTrackId = challengeTrack.Id, ListenedDurationSeconds = 3, ArtistCorrect = false, TitleCorrect = false, Score = 0 });
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(null, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        response.Tracks[0].FailureRatePercent.Should().Be(50.0);
    }

    // ---------------------------------------------------------------------------
    // Tests — réponses du joueur dans TrackStat
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task Handle_WhenPlayerHasCompletedSession_ReturnsTheirAnswerInTrackStat()
    {
        await using var db = CreateDbContext();
        var (challenge, challengeTrack) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        db.Players.Add(BuildPlayer(Player1));
        db.GameSessions.Add(new GameSession
        {
            Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 700, TotalDurationSeconds = 1, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed,
        });
        db.GameSessionAnswers.Add(new GameSessionAnswer
        {
            Id = 1, GameSessionId = 1, DailyChallengeTrackId = challengeTrack.Id,
            ListenedDurationSeconds = 1.5m, ArtistCorrect = true, TitleCorrect = false, Score = 350,
        });
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(Player1, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        var track = response.Tracks[0];
        track.ArtistCorrect.Should().Be(true);
        track.TitleCorrect.Should().Be(false);
        track.ListenedDurationSeconds.Should().Be(1.5m);
    }

    [Fact]
    public async Task Handle_WhenNoPlayerId_ReturnsNullPlayerAnswerFields()
    {
        await using var db = CreateDbContext();
        var (challenge, challengeTrack) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        db.Players.Add(BuildPlayer(Player1));
        db.GameSessions.Add(new GameSession
        {
            Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 400, TotalDurationSeconds = 3, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Completed,
        });
        db.GameSessionAnswers.Add(new GameSessionAnswer
        {
            Id = 1, GameSessionId = 1, DailyChallengeTrackId = challengeTrack.Id,
            ListenedDurationSeconds = 3m, ArtistCorrect = true, TitleCorrect = true, Score = 400,
        });
        await db.SaveChangesAsync();

        var result = await CreateHandler(db).Handle(null, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        var track = response.Tracks[0];
        track.ArtistCorrect.Should().BeNull();
        track.TitleCorrect.Should().BeNull();
        track.ListenedDurationSeconds.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WhenPlayerHasNoCompletedSession_ReturnsNullPlayerAnswerFields()
    {
        await using var db = CreateDbContext();
        var (challenge, _) = BuildTodayChallenge();
        db.DailyChallenges.Add(challenge);
        db.Players.AddRange(BuildPlayer(Player1), BuildPlayer(Player2));
        db.GameSessions.Add(new GameSession
        {
            Id = 1, PlayerId = Player1, DailyChallengeId = 1, TotalScore = 0, TotalDurationSeconds = 0, CreatedAt = DateTime.UtcNow, Status = SessionStatus.Abandoned,
        });
        await db.SaveChangesAsync();

        // Player2 demande les stats — n'a pas joué
        var result = await CreateHandler(db).Handle(Player2, CancellationToken.None);

        var response = ((Ok<TodayStatsResponse>)result).Value!;
        var track = response.Tracks[0];
        track.ArtistCorrect.Should().BeNull();
        track.TitleCorrect.Should().BeNull();
        track.ListenedDurationSeconds.Should().BeNull();
    }
}
