using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Streak;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.UnitTests.Common.Streak;

public sealed class StreakRulesReaderTests
{
    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static Setting BuildSetting(int id, string key, string value) =>
        new() { Id = id, Key = key, Value = value, UpdatedAt = DateTime.UtcNow };

    [Fact]
    public async Task LoadAsync_ReadsTheThreeKeysFromSettingsTable()
    {
        await using var db = CreateDbContext();
        db.Settings.AddRange(
            BuildSetting(10, "StreakFreezeEveryDays", "5"),
            BuildSetting(11, "StreakFreezeMax", "3"),
            BuildSetting(12, "StreakLostNudgeMinDays", "4"));
        await db.SaveChangesAsync();

        var rules = await StreakRulesReader.LoadAsync(db, CancellationToken.None);

        rules.Should().Be(new StreakRules(FreezeEveryDays: 5, FreezeMax: 3, LostNudgeMinDays: 4));
    }

    [Fact]
    public async Task LoadAsync_WhenKeysMissingOrInvalid_FallsBackToDefaults()
    {
        await using var db = CreateDbContext();
        db.Settings.Add(BuildSetting(11, "StreakFreezeMax", "abc"));
        await db.SaveChangesAsync();

        var rules = await StreakRulesReader.LoadAsync(db, CancellationToken.None);

        rules.Should().Be(new StreakRules(FreezeEveryDays: 7, FreezeMax: 2, LostNudgeMinDays: 2));
    }
}
