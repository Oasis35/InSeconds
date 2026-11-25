using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Infrastructure.Observability;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.UnitTests.Infrastructure.Observability;

/// <summary>Une seule branche de journaux vers OpenTelemetry : deux fournisseurs émettaient chaque ligne en double, la seconde sans le masque des codes de lien.</summary>
public class LoggerProvidersTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void UnSeulFournisseurOpenTelemetry_ProteGeParLeMasqueDesCodes(bool withOtlpExporter)
    {
        var builder = WebApplication.CreateBuilder();
        if (withOtlpExporter) builder.Configuration[ObservabilityExtensions.OtlpEndpointKey] = "http://localhost:4317";
        builder.AddInSecondsObservability("test", LinkSecrets.Paths);

        using var provider = builder.Services.BuildServiceProvider();
        var openTelemetry = provider.GetServices<ILoggerProvider>().Select(p => p.GetType().Name).Where(name => name.Contains("OpenTelemetry") || name.Contains("SecretPath")).ToList();

        Assert.Equal(["SecretPathLoggerProvider"], openTelemetry);
    }
}
