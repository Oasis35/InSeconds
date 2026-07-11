using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.UnitTests.Features.ChallengeGeneration;

public sealed class GenerateDailyChallengeTests
{
    // ---------------------------------------------------------------------------
    // Fixture
    // ---------------------------------------------------------------------------

    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options);

    private static DailyChallengeGenerator CreateGenerator(ApplicationDbContext db, int tracksPerChallenge = 3)
    {
        var settingsService = new SettingsService(
            Options.Create(new AppSettings { TracksPerChallenge = tracksPerChallenge }));
        return new DailyChallengeGenerator(db, settingsService,
            NullLogger<DailyChallengeGenerator>.Instance);
    }

    private static Track BuildTrack(int id, string artist = "Artist", string title = "Title", bool hasPreview = true) => new()
    {
        Id            = id,
        DeezerTrackId = 1000L + id,
        Artist        = artist,
        Title         = title,
        HasPreview    = hasPreview,
        CreatedAt     = DateTime.UtcNow,
    };

    // ---------------------------------------------------------------------------
    // Groupe A — DailyChallengeGenerator.GenerateAsync
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task Generate_WhenPoolEmpty_ReturnsPoolInsufficient()
    {
        await using var db = CreateDbContext();
        var generator = CreateGenerator(db);

        var result = await generator.GenerateAsync();

        result.Should().Be(GenerateResult.PoolInsufficient);
        (await db.DailyChallenges.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Generate_WhenPoolInsufficient_ReturnsPoolInsufficient()
    {
        await using var db = CreateDbContext();
        db.Tracks.AddRange(BuildTrack(1), BuildTrack(2));
        await db.SaveChangesAsync();

        var generator = CreateGenerator(db, tracksPerChallenge: 3);

        var result = await generator.GenerateAsync();

        result.Should().Be(GenerateResult.PoolInsufficient);
        (await db.DailyChallenges.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Generate_WhenChallengeAlreadyExists_ReturnsAlreadyExists()
    {
        await using var db = CreateDbContext();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        db.DailyChallenges.Add(new DailyChallenge { Date = today, Seed = today.DayNumber });
        db.Tracks.AddRange(BuildTrack(1), BuildTrack(2), BuildTrack(3));
        await db.SaveChangesAsync();

        var generator = CreateGenerator(db);
        var result = await generator.GenerateAsync();

        result.Should().Be(GenerateResult.AlreadyExists);
        (await db.DailyChallenges.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Generate_WhenPoolSufficient_ReturnsSuccessAndCreatesChallengeWith3Tracks()
    {
        await using var db = CreateDbContext();
        db.Tracks.AddRange(BuildTrack(1), BuildTrack(2), BuildTrack(3), BuildTrack(4), BuildTrack(5));
        await db.SaveChangesAsync();

        var generator = CreateGenerator(db, tracksPerChallenge: 3);
        var result = await generator.GenerateAsync();

        result.Should().Be(GenerateResult.Success);

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
        (await gen1.GenerateAsync()).Should().Be(GenerateResult.Success);
        var tracks1 = await db1.DailyChallengeTracks.Select(t => t.TrackId).OrderBy(x => x).ToListAsync();

        await using var db2 = CreateDbContext();
        db2.Tracks.AddRange(BuildTrack(1), BuildTrack(2), BuildTrack(3), BuildTrack(4), BuildTrack(5));
        await db2.SaveChangesAsync();
        var gen2 = CreateGenerator(db2, 3);
        (await gen2.GenerateAsync()).Should().Be(GenerateResult.Success);
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
        var result = await generator.GenerateAsync();

        result.Should().Be(GenerateResult.PoolInsufficient);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        (await db.DailyChallenges.AnyAsync(c => c.Date == today)).Should().BeFalse();
    }

    [Fact]
    public async Task Generate_ExcludesTracksWithoutPreview()
    {
        await using var db = CreateDbContext();
        // 5 tracks dont 5 avec HasPreview = false → pool disponible avec preview = 0
        db.Tracks.AddRange(
            BuildTrack(1, hasPreview: false),
            BuildTrack(2, hasPreview: false),
            BuildTrack(3, hasPreview: false),
            BuildTrack(4, hasPreview: false),
            BuildTrack(5, hasPreview: false));
        await db.SaveChangesAsync();

        var generator = CreateGenerator(db, tracksPerChallenge: 3);
        var result = await generator.GenerateAsync();

        result.Should().Be(GenerateResult.PoolInsufficient);
        (await db.DailyChallenges.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Generate_OnlyUsesTracksWithPreview()
    {
        await using var db = CreateDbContext();
        // 3 avec preview, 2 sans → exactement suffisant pour N=3
        db.Tracks.AddRange(
            BuildTrack(1, hasPreview: true),
            BuildTrack(2, hasPreview: true),
            BuildTrack(3, hasPreview: true),
            BuildTrack(4, hasPreview: false),
            BuildTrack(5, hasPreview: false));
        await db.SaveChangesAsync();

        var generator = CreateGenerator(db, tracksPerChallenge: 3);
        var result = await generator.GenerateAsync();

        result.Should().Be(GenerateResult.Success);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var challenge = await db.DailyChallenges.FirstOrDefaultAsync(c => c.Date == today);
        challenge.Should().NotBeNull();

        var selectedIds = await db.DailyChallengeTracks
            .Where(dct => dct.DailyChallengeId == challenge!.Id)
            .Select(dct => dct.TrackId)
            .ToListAsync();

        selectedIds.Should().NotContain([4, 5], "les tracks sans preview ne doivent pas être sélectionnées");
    }
}
