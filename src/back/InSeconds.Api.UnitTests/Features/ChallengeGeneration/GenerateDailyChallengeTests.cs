using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using System.Net;

namespace InSeconds.Api.UnitTests.Features.ChallengeGeneration;

public sealed class GenerateDailyChallengeTests
{
    // ---------------------------------------------------------------------------
    // Fixture
    // ---------------------------------------------------------------------------

    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    // Stub qui retourne une preview valide pour tous les tracks
    private static DeezerClient CreateDeezerClientWithPreview(string previewUrl = "https://cdn.deezer.com/preview/fake.mp3") =>
        new(new HttpClient(new StubHttpMessageHandler(previewUrl)) { BaseAddress = new Uri("https://api.deezer.com") });

    // Stub qui retourne preview vide (pas de preview)
    private static DeezerClient CreateDeezerClientNoPreview() =>
        new(new HttpClient(new StubHttpMessageHandler("")) { BaseAddress = new Uri("https://api.deezer.com") });

    private sealed class StubHttpMessageHandler(string previewUrl) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var json = "{\"id\":1,\"title\":\"Track\",\"preview\":\"" + previewUrl + "\",\"artist\":{\"name\":\"Artist\"},\"album\":{\"cover_medium\":null}}";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json),
            });
        }
    }

    private static DailyChallengeGenerator CreateGenerator(ApplicationDbContext db, int tracksPerChallenge = 3, DeezerClient? deezerClient = null)
    {
        var settingsService = new SettingsService(
            Options.Create(new AppSettings { TracksPerChallenge = tracksPerChallenge }));
        return new DailyChallengeGenerator(db, settingsService,
            deezerClient ?? CreateDeezerClientWithPreview(),
            NullLogger<DailyChallengeGenerator>.Instance);
    }

    private static Track BuildTrack(int id, string artist = "Artist", string title = "Title") => new()
    {
        Id            = id,
        DeezerTrackId = 1000L + id,
        Artist        = artist,
        Title         = title,
        CreatedAt     = DateTime.UtcNow,
    };

    // ---------------------------------------------------------------------------
    // Groupe A — ComputeDelayUntilNext3AmUtc
    // ---------------------------------------------------------------------------

    [Fact]
    public void ComputeDelay_At0000Utc_Returns3Hours()
    {
        var delay = GenerateDailyChallengeService.ComputeDelayUntilNext3AmUtc(
            new DateTime(2026, 6, 5, 0, 0, 0, DateTimeKind.Utc));
        delay.Should().Be(TimeSpan.FromHours(3));
    }

    [Fact]
    public void ComputeDelay_At0259Utc_ReturnsLessThanOrEqual1Minute()
    {
        var delay = GenerateDailyChallengeService.ComputeDelayUntilNext3AmUtc(
            new DateTime(2026, 6, 5, 2, 59, 0, DateTimeKind.Utc));
        delay.Should().BeLessThanOrEqualTo(TimeSpan.FromMinutes(1));
    }

    [Fact]
    public void ComputeDelay_At0300Utc_Returns24Hours()
    {
        var delay = GenerateDailyChallengeService.ComputeDelayUntilNext3AmUtc(
            new DateTime(2026, 6, 5, 3, 0, 0, DateTimeKind.Utc));
        delay.Should().Be(TimeSpan.FromHours(24));
    }

    [Fact]
    public void ComputeDelay_At2359Utc_ReturnsAbout3Hours()
    {
        var delay = GenerateDailyChallengeService.ComputeDelayUntilNext3AmUtc(
            new DateTime(2026, 6, 5, 23, 59, 0, DateTimeKind.Utc));
        delay.Should().BeCloseTo(TimeSpan.FromHours(3).Add(TimeSpan.FromMinutes(1)), TimeSpan.FromSeconds(5));
    }

    // ---------------------------------------------------------------------------
    // Groupe B — DailyChallengeGenerator.GenerateAsync
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task Generate_WhenPoolEmpty_LogsErrorAndCreatesNoChallenge()
    {
        await using var db = CreateDbContext();
        var generator = CreateGenerator(db);

        await generator.GenerateAsync();

        (await db.DailyChallenges.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Generate_WhenPoolInsufficient_LogsErrorAndCreatesNoChallenge()
    {
        await using var db = CreateDbContext();
        db.Tracks.AddRange(BuildTrack(1), BuildTrack(2));
        await db.SaveChangesAsync();

        var generator = CreateGenerator(db, tracksPerChallenge: 3);

        await generator.GenerateAsync();

        (await db.DailyChallenges.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Generate_WhenChallengeAlreadyExists_DoesNotInsertAnother()
    {
        await using var db = CreateDbContext();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        db.DailyChallenges.Add(new DailyChallenge { Date = today, Seed = today.DayNumber });
        db.Tracks.AddRange(BuildTrack(1), BuildTrack(2), BuildTrack(3));
        await db.SaveChangesAsync();

        var generator = CreateGenerator(db);
        await generator.GenerateAsync();

        (await db.DailyChallenges.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Generate_WhenPoolSufficient_CreatesChallengeWith3Tracks()
    {
        await using var db = CreateDbContext();
        db.Tracks.AddRange(BuildTrack(1), BuildTrack(2), BuildTrack(3), BuildTrack(4), BuildTrack(5));
        await db.SaveChangesAsync();

        var generator = CreateGenerator(db, tracksPerChallenge: 3);
        await generator.GenerateAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var challenge = await db.DailyChallenges.FirstOrDefaultAsync(c => c.Date == today);
        challenge.Should().NotBeNull();
        challenge!.Seed.Should().Be(today.DayNumber);

        var challengeTracks = await db.DailyChallengeTracks
            .Where(dct => dct.DailyChallengeId == challenge.Id)
            .ToListAsync();

        challengeTracks.Should().HaveCount(3);
        challengeTracks.Select(t => t.Position).Should().BeEquivalentTo([1, 2, 3]);
        challengeTracks.Should().AllSatisfy(t => t.DeezerRankSnapshot.Should().Be(0));
    }

    [Fact]
    public async Task Generate_WithSameSeed_ProducesSameSelection()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        await using var db1 = CreateDbContext();
        db1.Tracks.AddRange(BuildTrack(1), BuildTrack(2), BuildTrack(3), BuildTrack(4), BuildTrack(5));
        await db1.SaveChangesAsync();
        var gen1 = CreateGenerator(db1, 3);
        await gen1.GenerateAsync();
        var tracks1 = await db1.DailyChallengeTracks.Select(t => t.TrackId).OrderBy(x => x).ToListAsync();

        await using var db2 = CreateDbContext();
        db2.Tracks.AddRange(BuildTrack(1), BuildTrack(2), BuildTrack(3), BuildTrack(4), BuildTrack(5));
        await db2.SaveChangesAsync();
        var gen2 = CreateGenerator(db2, 3);
        await gen2.GenerateAsync();
        var tracks2 = await db2.DailyChallengeTracks.Select(t => t.TrackId).OrderBy(x => x).ToListAsync();

        tracks1.Should().Equal(tracks2);
    }

    [Fact]
    public async Task Generate_ExcludesTracksAlreadyUsedInChallenge()
    {
        await using var db = CreateDbContext();

        db.Tracks.AddRange(BuildTrack(1), BuildTrack(2), BuildTrack(3), BuildTrack(4), BuildTrack(5));
        var pastChallenge = new DailyChallenge
        {
            Date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1),
            Seed = 1,
        };
        db.DailyChallenges.Add(pastChallenge);
        await db.SaveChangesAsync();

        db.DailyChallengeTracks.AddRange(
            new DailyChallengeTrack { DailyChallengeId = pastChallenge.Id, TrackId = 1, Position = 1, DeezerRankSnapshot = 0 },
            new DailyChallengeTrack { DailyChallengeId = pastChallenge.Id, TrackId = 2, Position = 2, DeezerRankSnapshot = 0 },
            new DailyChallengeTrack { DailyChallengeId = pastChallenge.Id, TrackId = 3, Position = 3, DeezerRankSnapshot = 0 });
        await db.SaveChangesAsync();

        // Pool disponible = 2 tracks (4 et 5), N=3 → insuffisant
        var generator = CreateGenerator(db, tracksPerChallenge: 3);
        await generator.GenerateAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        (await db.DailyChallenges.AnyAsync(c => c.Date == today)).Should().BeFalse();
    }

    [Fact]
    public async Task Generate_ExcludesTracksWithoutPreview()
    {
        await using var db = CreateDbContext();
        // 5 tracks mais Deezer retourne preview vide pour tous → pool = 0 avec preview
        db.Tracks.AddRange(BuildTrack(1), BuildTrack(2), BuildTrack(3), BuildTrack(4), BuildTrack(5));
        await db.SaveChangesAsync();

        var generator = CreateGenerator(db, tracksPerChallenge: 3, deezerClient: CreateDeezerClientNoPreview());
        await generator.GenerateAsync();

        (await db.DailyChallenges.AnyAsync()).Should().BeFalse();
    }
}
