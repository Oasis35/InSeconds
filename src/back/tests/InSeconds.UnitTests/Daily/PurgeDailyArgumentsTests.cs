using InSeconds.Api.Infrastructure.Hosting;

namespace InSeconds.UnitTests.Daily;

public class PurgeDailyArgumentsTests
{
    [Fact]
    public void DateEtApply_SontLusEtRetiresDesArgumentsDeLHote()
    {
        var ok = PurgeDailyCommand.TryParseArguments(["--apply", "--purge-daily-before", "2026-09-15", "--x=1"], out var before, out var apply, out var rest);

        Assert.True(ok);
        Assert.Equal(new DateOnly(2026, 9, 15), before);
        Assert.True(apply);
        Assert.Equal(["--x=1"], rest);
    }

    [Fact]
    public void SansApply_SimulationParDefaut()
    {
        Assert.True(PurgeDailyCommand.TryParseArguments(["--purge-daily-before", "2026-09-15"], out _, out var apply, out _));
        Assert.False(apply);
    }

    [Theory]
    [InlineData("--purge-daily-before")]
    [InlineData("--purge-daily-before", "--apply")]
    [InlineData("--purge-daily-before", "15/09/2026")]
    [InlineData("--purge-daily-before", "2026-13-01")]
    public void DateAbsenteOuIllisible_Refusee(params string[] args) =>
        Assert.False(PurgeDailyCommand.TryParseArguments(args, out _, out _, out _));
}
