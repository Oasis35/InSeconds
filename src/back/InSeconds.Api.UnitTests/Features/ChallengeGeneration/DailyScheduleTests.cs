using FluentAssertions;
using Xunit;
using InSeconds.Api.Features.ChallengeGeneration;

namespace InSeconds.Api.UnitTests.Features.ChallengeGeneration;

// Planification des jobs nocturnes : génération du défi à 0h00 UTC,
// refresh des previews à 23h00 UTC (la veille, avant la génération).
public sealed class DailyScheduleTests
{
    // -----------------------------------------------------------------------
    // Génération (hour = 0)
    // -----------------------------------------------------------------------

    [Fact]
    public void DelayUntilMidnight_At0000Utc_Returns24Hours()
    {
        // Pile à minuit → on attend le minuit suivant (pas de déclenchement immédiat).
        var delay = DailySchedule.DelayUntilNextUtcHour(0,
            new DateTime(2026, 6, 5, 0, 0, 0, DateTimeKind.Utc));
        delay.Should().Be(TimeSpan.FromHours(24));
    }

    [Fact]
    public void DelayUntilMidnight_At2359Utc_ReturnsLessThanOrEqual1Minute()
    {
        var delay = DailySchedule.DelayUntilNextUtcHour(0,
            new DateTime(2026, 6, 5, 23, 59, 0, DateTimeKind.Utc));
        delay.Should().BeLessThanOrEqualTo(TimeSpan.FromMinutes(1));
    }

    [Fact]
    public void DelayUntilMidnight_At0300Utc_Returns21Hours()
    {
        var delay = DailySchedule.DelayUntilNextUtcHour(0,
            new DateTime(2026, 6, 5, 3, 0, 0, DateTimeKind.Utc));
        delay.Should().Be(TimeSpan.FromHours(21));
    }

    [Fact]
    public void DelayUntilMidnight_At1200Utc_Returns12Hours()
    {
        var delay = DailySchedule.DelayUntilNextUtcHour(0,
            new DateTime(2026, 6, 5, 12, 0, 0, DateTimeKind.Utc));
        delay.Should().Be(TimeSpan.FromHours(12));
    }

    // -----------------------------------------------------------------------
    // Refresh previews (hour = 23)
    // -----------------------------------------------------------------------

    [Fact]
    public void DelayUntil11Pm_At2300Utc_Returns24Hours()
    {
        var delay = DailySchedule.DelayUntilNextUtcHour(23,
            new DateTime(2026, 6, 5, 23, 0, 0, DateTimeKind.Utc));
        delay.Should().Be(TimeSpan.FromHours(24));
    }

    [Fact]
    public void DelayUntil11Pm_At2259Utc_ReturnsLessThanOrEqual1Minute()
    {
        var delay = DailySchedule.DelayUntilNextUtcHour(23,
            new DateTime(2026, 6, 5, 22, 59, 0, DateTimeKind.Utc));
        delay.Should().BeLessThanOrEqualTo(TimeSpan.FromMinutes(1));
    }

    [Fact]
    public void DelayUntil11Pm_At1200Utc_Returns11Hours()
    {
        var delay = DailySchedule.DelayUntilNextUtcHour(23,
            new DateTime(2026, 6, 5, 12, 0, 0, DateTimeKind.Utc));
        delay.Should().Be(TimeSpan.FromHours(11));
    }

    [Fact]
    public void DelayUntil11Pm_At2330Utc_ReturnsAbout23Hours30()
    {
        // Après 23h → prochaine occurrence le lendemain.
        var delay = DailySchedule.DelayUntilNextUtcHour(23,
            new DateTime(2026, 6, 5, 23, 30, 0, DateTimeKind.Utc));
        delay.Should().Be(TimeSpan.FromHours(23.5));
    }
}
