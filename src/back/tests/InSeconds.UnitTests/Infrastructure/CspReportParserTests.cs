using System.Text;
using InSeconds.Api.Infrastructure.Errors;

namespace InSeconds.UnitTests.Infrastructure;

public class CspReportParserTests
{
    [Fact]
    public void ReportingApi_LitLeCorpsDesViolations_EtIgnoreLesAutresTypes()
    {
        var violations = Parse("""
            [{"type":"csp-violation","body":{"documentURL":"https://inseconds.cc/daily","blockedURL":"inline",
              "effectiveDirective":"script-src-elem","disposition":"report","sourceFile":"https://inseconds.cc/main.js","lineNumber":7}},
             {"type":"deprecation","body":{"id":"x"}}]
            """);

        var violation = Assert.Single(violations);
        Assert.Equal(new CspViolation("https://inseconds.cc/daily", "inline", "script-src-elem", "report", "https://inseconds.cc/main.js", 7), violation);
    }

    [Fact]
    public void AncienFormat_DirectiveDeSafari_PremierMotDeViolatedDirective()
    {
        var violation = Assert.Single(Parse("""
            {"csp-report":{"document-uri":"https://inseconds.cc/","blocked-uri":"https://x.test/a.js","violated-directive":"script-src 'self'"}}
            """));

        Assert.Equal("script-src", violation.Directive);
        Assert.Null(violation.Disposition);
    }

    [Theory]
    [InlineData("chrome-extension://abc/content.js")]
    [InlineData("moz-extension://abc/content.js")]
    [InlineData("safari-web-extension://abc/content.js")]
    public void ViolationDUneExtension_Ecartee(string url)
    {
        Assert.Empty(Parse($$$"""{"csp-report":{"blocked-uri":"{{{url}}}","effective-directive":"script-src-elem"}}"""));
        Assert.Empty(Parse($$$"""{"csp-report":{"blocked-uri":"inline","source-file":"{{{url}}}","effective-directive":"script-src-elem"}}"""));
    }

    [Fact]
    public void LotTropGros_PlafonneParRequete()
    {
        var report = """{"type":"csp-violation","body":{"blockedURL":"https://x.test/a.js","effectiveDirective":"img-src"}}""";
        var batch = "[" + string.Join(',', Enumerable.Repeat(report, 50)) + "]";

        Assert.Equal(CspReportParser.MaxViolationsPerRequest, Parse(batch).Count);
    }

    [Fact]
    public void ChampsTropLongs_Tronques()
    {
        var violation = Assert.Single(Parse($$$"""{"csp-report":{"blocked-uri":"https://x.test/{{{new string('a', 2000)}}}","effective-directive":"img-src"}}"""));

        Assert.Equal(CspReportParser.MaxFieldLength, violation.BlockedUrl!.Length);
    }

    [Theory]
    [InlineData("")]
    [InlineData("pas du json")]
    [InlineData("42")]
    [InlineData("""{"csp-report":"texte"}""")]
    [InlineData("""[1,"a",{"type":"csp-violation","body":"texte"}]""")]
    public void RapportIllisible_AucuneViolation(string body) => Assert.Empty(Parse(body));

    [Fact]
    public void Description_MemeTexteQueLAncienEcouteurDuFront()
    {
        var violation = new CspViolation("https://inseconds.cc/daily", "https://x.test/p?jeton=1", "script-src-elem", "report", "https://inseconds.cc/main.js?v=2", 7);

        Assert.Equal("CSP (report) script-src-elem bloque https://x.test/p depuis https://inseconds.cc/main.js:7", ReportCspViolationEndpoint.Describe(violation));
        Assert.Equal("CSP (enforce) inconnue bloque inconnu", ReportCspViolationEndpoint.Describe(new CspViolation(null, null, null, null, null, null)));
    }

    [Theory]
    [InlineData("https://inseconds.cc/daily/archive/2026-10-20?token=x#f", "/daily/archive/2026-10-20")]
    [InlineData("/daily?x=1", "/daily")]
    [InlineData(null, null)]
    public void CheminDeLaPage_SansDomaineNiQueryString(string? url, string? expected) =>
        Assert.Equal(expected, ReportCspViolationEndpoint.PathOf(url));

    private static IReadOnlyList<CspViolation> Parse(string json) => CspReportParser.Parse(Encoding.UTF8.GetBytes(json));
}
