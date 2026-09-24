using InSeconds.Api.Features.Telemetry.ReportClientError;
using InSeconds.Api.UnitTests.Common.Observability;
using Xunit;

namespace InSeconds.Api.UnitTests.Features.Telemetry;

public class ReportClientErrorHandlerTests
{
    [Fact]
    public void Handle_NeutraliseLesRetoursALaLigneDesChampsClient()
    {
        var logger = new CapturingLogger<ReportClientErrorHandler>();
        var handler = new ReportClientErrorHandler(logger);

        handler.Handle(new ReportClientErrorCommand(
            Source: "js",
            Message: "Boom\r\nERROR fausse ligne injectée",
            Stack: "at a (main.js:1:1)\nat b (main.js:2:2)",
            Url: "/\nfaux",
            HttpStatus: null,
            RelatedTraceId: null));

        var message = Assert.Single(logger.Messages);
        Assert.DoesNotContain("\n", message);
        Assert.DoesNotContain("\r", message);
        Assert.Contains("at a (main.js:1:1) | at b (main.js:2:2)", message);
        Assert.Contains("Boom ERROR fausse ligne injectée", message);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("sans saut", "sans saut")]
    [InlineData("a\r\nb\rc\nd", "a|b|c|d")]
    public void ToSingleLine_RemplaceChaqueRetourALaLigne(string? input, string? expected)
        => Assert.Equal(expected, ReportClientErrorHandler.ToSingleLine(input, "|"));
}
