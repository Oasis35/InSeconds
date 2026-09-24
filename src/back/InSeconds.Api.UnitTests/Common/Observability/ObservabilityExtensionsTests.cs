using System.Diagnostics;
using FluentAssertions;
using InSeconds.Api.Common.Observability;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Observability;

public sealed class ObservabilityExtensionsTests
{
    [Theory]
    [InlineData("/health", false)]
    [InlineData("/health/ready", false)]
    [InlineData("/api/sessions", true)]
    [InlineData("/api/client-errors", true)]
    public void IsTracedRequest_ExclutLePollingHealth(string path, bool expected)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;

        ObservabilityExtensions.IsTracedRequest(context).Should().Be(expected);
    }

    [Fact]
    public void CurrentTraceId_AvecActivite_RenvoieLeTraceIdHexa()
    {
        using var activity = new Activity("test").SetIdFormat(ActivityIdFormat.W3C).Start();

        var traceId = ObservabilityExtensions.CurrentTraceId(new DefaultHttpContext());

        traceId.Should().Be(activity.TraceId.ToHexString()).And.MatchRegex("^[0-9a-f]{32}$");
    }

    [Fact]
    public void CurrentTraceId_SansActivite_RetombeSurTraceIdentifier()
    {
        Activity.Current = null;
        var context = new DefaultHttpContext { TraceIdentifier = "0HN-fallback" };

        ObservabilityExtensions.CurrentTraceId(context).Should().Be("0HN-fallback");
    }
}
