using InSeconds.Api.Infrastructure.Hosting;

namespace InSeconds.UnitTests.Infrastructure;

public class MigrateOnlyCommandTests
{
    [Fact]
    public void IsRequested_AvecLeDrapeau_Vrai() =>
        Assert.True(MigrateOnlyCommand.IsRequested(["--urls", "http://+:8080", "--migrate-only"]));

    [Theory]
    [InlineData]
    [InlineData("--migrate")]
    [InlineData("--MIGRATE-ONLY")]
    public void IsRequested_SansLeDrapeauExact_Faux(params string[] args) =>
        Assert.False(MigrateOnlyCommand.IsRequested(args));
}
