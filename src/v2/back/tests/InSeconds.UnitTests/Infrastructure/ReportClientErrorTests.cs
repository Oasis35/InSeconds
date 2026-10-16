using InSeconds.Api.Infrastructure.Errors;
using InSeconds.UnitTests.Support;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace InSeconds.UnitTests.Infrastructure;

public class ReportClientErrorTests
{
    private readonly ClientErrorReportValidator _validator = new();
    private readonly CapturingLogger<ClientErrorReport> _logger = new();

    [Fact]
    public void Validation_RapportComplet_Accepte()
    {
        var report = new ClientErrorReport("http", "Http failure response", "at x\nat y", "/daily", 503, new string('a', 32));

        Assert.True(_validator.Validate(report).IsValid);
    }

    [Fact]
    public void Validation_ViolationDeCsp_Accepte() =>
        Assert.True(_validator.Validate(new ClientErrorReport("csp", "CSP script-src-elem bloque https://x.test/a.js", null, "/daily", null, null)).IsValid);

    [Theory]
    [InlineData("autre", "message")]
    [InlineData("js", "")]
    public void Validation_SourceInconnueOuMessageVide_Refuse(string source, string message) =>
        Assert.False(_validator.Validate(new ClientErrorReport(source, message, null, null, null, null)).IsValid);

    [Fact]
    public void Validation_ChampsTropLongsOuStatutHorsBornes_Refuse()
    {
        Assert.False(_validator.Validate(Report() with { Message = new string('m', 1001) }).IsValid);
        Assert.False(_validator.Validate(Report() with { Stack = new string('s', 8001) }).IsValid);
        Assert.False(_validator.Validate(Report() with { Url = "/" + new string('u', 500) }).IsValid);
        Assert.False(_validator.Validate(Report() with { RelatedTraceId = new string('t', 65) }).IsValid);
        Assert.False(_validator.Validate(Report() with { HttpStatus = 600 }).IsValid);
        Assert.False(_validator.Validate(Report() with { AppVersion = new string('v', 41) }).IsValid);
    }

    [Fact]
    public void Remontee_JournaliseEnErreur_AvecLIdentifiantDeLaV1()
    {
        ReportClientErrorEndpoint.Post(Report(), Request(), _logger);

        var entry = Assert.Single(_logger.Entries);
        Assert.Equal(LogLevel.Error, entry.Level);
        Assert.Equal(1100, entry.EventId.Id);
        Assert.Contains("TypeError: x is undefined", entry.Message);
    }

    [Fact]
    public void Remontee_RetoursALaLigneNeutralises_PasDeFaussesLignesDansLesJournaux()
    {
        ReportClientErrorEndpoint.Post(Report() with
        {
            Message = "ligne 1\r\nFAUX journal",
            Stack = "at a\nat b",
        }, Request(), _logger);

        var entry = Assert.Single(_logger.Entries);
        Assert.DoesNotContain('\n', entry.Message);
        Assert.DoesNotContain('\r', entry.Message);
        Assert.Equal("at a|at b", Property(entry, "ClientStack"));
    }

    [Theory]
    [InlineData("/account/login/verify?token=secret", "/account/login/verify")]
    [InlineData("/daily#reponse", "/daily")]
    [InlineData("/daily", "/daily")]
    public void Remontee_JamaisDeQueryStringNiDeFragment(string url, string logged)
    {
        ReportClientErrorEndpoint.Post(Report() with { Url = url }, Request(), _logger);

        Assert.Equal(logged, Property(Assert.Single(_logger.Entries), "Url"));
    }

    [Fact]
    public void Remontee_VersionEnLigneEtAppareil_Journalises_SansLeUserAgentBrut()
    {
        const string userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

        ReportClientErrorEndpoint.Post(Report() with { AppVersion = "2026-10-13T10:00:00Z", Online = false }, Request(userAgent), _logger);

        var entry = Assert.Single(_logger.Entries);
        Assert.Equal("2026-10-13T10:00:00Z", Property(entry, "AppVersion"));
        Assert.Equal(false, Property(entry, "Online"));
        Assert.Equal("Safari · iPhone", Property(entry, "Device"));
        Assert.DoesNotContain(userAgent, entry.Message);
    }

    [Fact]
    public void Remontee_SansCesChamps_FrontV1EnCache_Accepte()
    {
        var report = Report();

        Assert.True(_validator.Validate(report).IsValid);
        ReportClientErrorEndpoint.Post(report, Request(), _logger);
        var entry = Assert.Single(_logger.Entries);
        Assert.Null(Property(entry, "AppVersion"));
        Assert.Null(Property(entry, "Online"));
        Assert.Null(Property(entry, "Device"));
    }

    private static HttpRequest Request(string? userAgent = null)
    {
        var context = new DefaultHttpContext();
        if (userAgent is not null)
            context.Request.Headers.UserAgent = userAgent;
        return context.Request;
    }

    private static ClientErrorReport Report() =>
        new("js", "TypeError: x is undefined", null, "/daily", null, null);

    private static object? Property(CapturedLog entry, string name) =>
        entry.Properties.Single(p => p.Key == name).Value;
}
