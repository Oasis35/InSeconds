using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.UnitTests.Common.Settings;

public sealed class SettingsServiceTests
{
    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static SettingsService CreateService(ApplicationDbContext db) =>
        new(db, new MemoryCache(Options.Create(new MemoryCacheOptions())));

    private static void SeedAllSettings(ApplicationDbContext db) =>
        db.Settings.AddRange(
            new Setting { Id = 1, Key = "GuessTimerSeconds",      Value = "30",                           UpdatedAt = DateTime.UtcNow },
            new Setting { Id = 2, Key = "AllowedDurationsSeconds", Value = "1,3,5",                       UpdatedAt = DateTime.UtcNow },
            new Setting { Id = 3, Key = "MaxExtensionsPerAnswer",  Value = "2",                           UpdatedAt = DateTime.UtcNow },
            new Setting { Id = 4, Key = "TracksPerChallenge",      Value = "5",                           UpdatedAt = DateTime.UtcNow },
            new Setting { Id = 5, Key = "DurationScores",          Value = "1:900,3:600,5:400",           UpdatedAt = DateTime.UtcNow }
        );

    // ---------------------------------------------------------------------------
    // Parsing des clés
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task GetAsync_ParsesAllSettings()
    {
        await using var db = CreateDbContext();
        SeedAllSettings(db);
        await db.SaveChangesAsync();

        var result = await CreateService(db).GetAsync();

        result.GuessTimerSeconds.Should().Be(30);
        result.AllowedDurationsSeconds.Should().Equal(1, 3, 5);
        result.MaxExtensionsPerAnswer.Should().Be(2);
        result.TracksPerChallenge.Should().Be(5);
        result.DurationScores.Should().BeEquivalentTo(new Dictionary<int, int> { [1] = 900, [3] = 600, [5] = 400 });
    }

    // ---------------------------------------------------------------------------
    // Valeurs par défaut si clé absente
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task GetAsync_WhenNoSettings_ReturnsDefaults()
    {
        await using var db = CreateDbContext();

        var result = await CreateService(db).GetAsync();

        result.GuessTimerSeconds.Should().Be(AppSettings.Default.GuessTimerSeconds);
        result.AllowedDurationsSeconds.Should().Equal(AppSettings.Default.AllowedDurationsSeconds);
        result.MaxExtensionsPerAnswer.Should().Be(AppSettings.Default.MaxExtensionsPerAnswer);
        result.TracksPerChallenge.Should().Be(AppSettings.Default.TracksPerChallenge);
        result.DurationScores.Should().BeEquivalentTo(AppSettings.Default.DurationScores);
    }

    [Fact]
    public async Task GetAsync_WhenSomeMissing_UsesDefaultForMissingKey()
    {
        await using var db = CreateDbContext();
        db.Settings.Add(new Setting { Id = 1, Key = "GuessTimerSeconds", Value = "15", UpdatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var result = await CreateService(db).GetAsync();

        result.GuessTimerSeconds.Should().Be(15);
        result.AllowedDurationsSeconds.Should().Equal(AppSettings.Default.AllowedDurationsSeconds);
    }

    // ---------------------------------------------------------------------------
    // Cache : 2 appels → 1 seul hit BD
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task GetAsync_SecondCall_ReturnsCachedResult()
    {
        await using var db = CreateDbContext();
        SeedAllSettings(db);
        await db.SaveChangesAsync();

        var service = CreateService(db);

        var first  = await service.GetAsync();
        var second = await service.GetAsync();

        second.Should().BeSameAs(first, "le résultat doit venir du cache, pas d'une nouvelle instance");
    }

    // ---------------------------------------------------------------------------
    // Robustesse parsing
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task GetAsync_WhenDurationScoresMalformed_ReturnsDefault()
    {
        await using var db = CreateDbContext();
        db.Settings.Add(new Setting { Id = 5, Key = "DurationScores", Value = "invalide", UpdatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var result = await CreateService(db).GetAsync();

        result.DurationScores.Should().BeEquivalentTo(AppSettings.Default.DurationScores);
    }
}
