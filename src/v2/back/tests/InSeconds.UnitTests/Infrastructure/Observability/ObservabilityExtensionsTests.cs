using InSeconds.Infrastructure.Observability;
using Microsoft.AspNetCore.Http;

namespace InSeconds.UnitTests.Infrastructure.Observability;

public class ObservabilityExtensionsTests
{
    [Theory]
    [InlineData("/health", false)]
    [InlineData("/health/ready", false)]
    [InlineData("/jobs", false)]
    [InlineData("/jobs/stats", false)]
    [InlineData("/api/sessions", true)]
    [InlineData("/healthy", true)]
    public void Traces_SansLePollingDeHealthNiDuTableauDeBord(string path, bool traced)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;

        Assert.Equal(traced, ObservabilityExtensions.IsTracedRequest(context));
    }

    [Fact]
    public void LesTachesPlanifieesSontTracees() =>
        Assert.Contains(TelemetrySources.Jobs, ObservabilityExtensions.TracedSources);
}
