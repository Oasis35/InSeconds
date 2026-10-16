using InSeconds.Api.Infrastructure.Time;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.UnitTests.Infrastructure;

public class GameCalendarTests
{
    [Fact]
    public void Today_JusteAvantMinuitUtc_ResteLeJourEnCours()
    {
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 9, 30, 23, 59, 59, TimeSpan.Zero));

        Assert.Equal(new DateOnly(2026, 9, 30), new GameCalendar(time).Today);
    }

    [Fact]
    public void Today_AMinuitUtc_PasseAuJourSuivant()
    {
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 9, 30, 23, 59, 59, TimeSpan.Zero));
        var calendar = new GameCalendar(time);

        time.Advance(TimeSpan.FromSeconds(1));

        Assert.Equal(new DateOnly(2026, 10, 1), calendar.Today);
    }

    [Fact]
    public void Today_SeCalculeEnUtc_PasEnHeureLocale()
    {
        // 1 h du matin à Paris le 1er octobre = encore le 30 septembre en UTC.
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 10, 1, 1, 0, 0, TimeSpan.FromHours(2)));

        Assert.Equal(new DateOnly(2026, 9, 30), new GameCalendar(time).Today);
    }

    [Fact]
    public void StartOf_RenvoieMinuitUtc()
    {
        var calendar = new GameCalendar(new FakeTimeProvider());

        Assert.Equal(
            new DateTimeOffset(2026, 9, 30, 0, 0, 0, TimeSpan.Zero),
            calendar.StartOf(new DateOnly(2026, 9, 30)));
    }
}
