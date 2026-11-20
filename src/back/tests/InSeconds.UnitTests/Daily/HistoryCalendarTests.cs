using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

public class HistoryCalendarTests
{
    private static readonly DateOnly Today = new(2026, 11, 20);

    private static HistoryCalendarInput Day(int day, SessionStatus? status = null, int score = 0, int answers = 0) =>
        new(new DateOnly(2026, 11, day), 5, status, score, answers);

    [Theory]
    [InlineData(SessionStatus.Completed, 5, HistoryDayKind.Played)]
    [InlineData(SessionStatus.Abandoned, 2, HistoryDayKind.Unfinished)]
    [InlineData(SessionStatus.Expired, 1, HistoryDayKind.Unfinished)]
    [InlineData(SessionStatus.Abandoned, 0, HistoryDayKind.Missed)]
    [InlineData(SessionStatus.Expired, 0, HistoryDayKind.Missed)]
    public void UnJourPasse_SonEtatSuitSaPartie(SessionStatus status, int answers, HistoryDayKind expected) =>
        Assert.Equal(expected, HistoryCalendar.StateOf(Day(18, status, answers: answers), Today));

    [Fact]
    public void UnJourPasseSansPartie_EstManque() =>
        Assert.Equal(HistoryDayKind.Missed, HistoryCalendar.StateOf(Day(18), Today));

    [Fact]
    public void Piege18_LaVeilleEncoreEnCours_SeReprend() =>
        Assert.Equal(HistoryDayKind.Resumable, HistoryCalendar.StateOf(Day(19, SessionStatus.Pending, answers: 2), Today));

    [Fact]
    public void Aujourdhui_ResteAJouerTantQuIlNEstPasTermine()
    {
        Assert.Equal(HistoryDayKind.Today, HistoryCalendar.StateOf(Day(20), Today));
        Assert.Equal(HistoryDayKind.Today, HistoryCalendar.StateOf(Day(20, SessionStatus.Pending, answers: 3), Today));
        Assert.Equal(HistoryDayKind.Played, HistoryCalendar.StateOf(Day(20, SessionStatus.Completed, 2400, 5), Today));
        Assert.Equal(HistoryDayKind.Unfinished, HistoryCalendar.StateOf(Day(20, SessionStatus.Abandoned, answers: 1), Today));
    }

    [Fact]
    public void LesJours_SArretentAAujourdhui_DansLOrdre_AvecLaBorneDeLaTeinte()
    {
        var days = HistoryCalendar.Days([Day(21), Day(19, SessionStatus.Completed, 2000, 5), Day(18)], Today, 1000);

        Assert.Equal([(18, HistoryDayKind.Missed, (int?)null), (19, HistoryDayKind.Played, 2000)], days.Select(d => (d.Date.Day, d.State, d.Score)));
        Assert.All(days, d => Assert.Equal(5000, d.MaxPossibleScore));
    }

    [Fact]
    public void LesChiffresDuMois_ComptentAujourdhuiSeulementSIlEstTermine()
    {
        var pending = HistoryCalendar.Days([Day(18, SessionStatus.Completed, 2000, 5), Day(19), Day(20)], Today, 1000);
        Assert.Equal(new HistoryMonthStats(1, 2, 2000, 2000), HistoryCalendar.Stats(pending, Today));

        var done = HistoryCalendar.Days([Day(18, SessionStatus.Completed, 2000, 5), Day(19), Day(20, SessionStatus.Completed, 3001, 5)], Today, 1000);
        Assert.Equal(new HistoryMonthStats(2, 3, 2501, 3001), HistoryCalendar.Stats(done, Today));
    }

    [Fact]
    public void UnMoisSansPartieTerminee_NAPasDeMoyenne() =>
        Assert.Equal(new HistoryMonthStats(0, 1, null, null), HistoryCalendar.Stats(HistoryCalendar.Days([Day(18)], Today, 1000), Today));
}
