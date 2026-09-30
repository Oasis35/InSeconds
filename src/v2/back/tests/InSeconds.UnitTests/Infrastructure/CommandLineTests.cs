using InSeconds.Api.Infrastructure.Hosting;

namespace InSeconds.UnitTests.Infrastructure;

public class CommandLineTests
{
    [Theory]
    [InlineData]
    [InlineData("run")]
    [InlineData("--urls", "http://+:8080")]
    [InlineData("--environment", "Staging")]
    public void StartsServer_SansCommande_Vrai(params string[] args) =>
        Assert.True(CommandLine.StartsServer(args));

    [Theory]
    [InlineData("codegen", "write")]
    [InlineData("describe")]
    public void StartsServer_CommandeWolverine_Faux(params string[] args) =>
        Assert.False(CommandLine.StartsServer(args));
}
