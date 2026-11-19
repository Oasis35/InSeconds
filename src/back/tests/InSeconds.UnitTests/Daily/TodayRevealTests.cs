using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

/// <summary>Ce que le joueur voit du défi du jour selon sa partie : une seule règle pour <c>stats/today</c> et les scores des groupes (piège 31).</summary>
public class TodayRevealTests
{
    [Theory]
    [InlineData(SessionStatus.Completed, 5, true)]
    [InlineData(SessionStatus.Abandoned, 1, true)]
    [InlineData(SessionStatus.Abandoned, 0, false)]
    [InlineData(SessionStatus.Expired, 0, true)]
    [InlineData(SessionStatus.Pending, 3, false)]
    [InlineData(null, 0, false)]
    public void Piege31_LesStatsEtLesScoresDuJourSuiventLaMemeRegle(SessionStatus? status, int answered, bool expected) =>
        Assert.Equal(expected, TodayReveal.Allows(status, answered));
}
