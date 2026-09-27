using Xunit;
using InSeconds.Api.Features.Admin.Stats.GetWeeklyRecap;

namespace InSeconds.Api.UnitTests.Features.Admin.Stats;

public class WeeklyRecapPeriodTests
{
    private static readonly DateOnly Today = new(2026, 9, 27);

    [Fact]
    public void SansBornes_7DerniersJoursAujourdhuiInclus()
    {
        Assert.True(GetWeeklyRecapEndpoint.TryResolvePeriod(null, null, Today, out var from, out var to, out var error));
        Assert.Equal(new DateOnly(2026, 9, 21), from);
        Assert.Equal(Today, to);
        Assert.Null(error);
    }

    [Fact]
    public void BornesFournies_Utilisees()
    {
        Assert.True(GetWeeklyRecapEndpoint.TryResolvePeriod("2026-09-01", "2026-09-10", Today, out var from, out var to, out _));
        Assert.Equal(new DateOnly(2026, 9, 1), from);
        Assert.Equal(new DateOnly(2026, 9, 10), to);
    }

    [Fact]
    public void FinSeule_DebutA7JoursAvant()
    {
        Assert.True(GetWeeklyRecapEndpoint.TryResolvePeriod(null, "2026-09-10", Today, out var from, out var to, out _));
        Assert.Equal(new DateOnly(2026, 9, 4), from);
        Assert.Equal(new DateOnly(2026, 9, 10), to);
    }

    [Fact]
    public void UnSeulJour_Accepte()
    {
        Assert.True(GetWeeklyRecapEndpoint.TryResolvePeriod("2026-09-10", "2026-09-10", Today, out _, out _, out _));
    }

    [Theory]
    [InlineData("27/09/2026", null)]
    [InlineData(null, "pas-une-date")]
    public void FormatInvalide_InvalidDate(string? from, string? to)
    {
        Assert.False(GetWeeklyRecapEndpoint.TryResolvePeriod(from, to, Today, out _, out _, out var error));
        Assert.Equal("invalid_date", error);
    }

    [Theory]
    [InlineData("2026-09-10", "2026-09-09")]
    [InlineData("2025-01-01", "2026-09-10")]
    public void PeriodeIncoherenteOuTropLongue_InvalidPeriod(string from, string to)
    {
        Assert.False(GetWeeklyRecapEndpoint.TryResolvePeriod(from, to, Today, out _, out _, out var error));
        Assert.Equal("invalid_period", error);
    }
}
