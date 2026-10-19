using InSeconds.Infrastructure.Http;
using Microsoft.AspNetCore.Http;

namespace InSeconds.UnitTests.Infrastructure.Http;

public class SecurityHeadersTests
{
    [Fact]
    public void Api_CspQuiNAutoriseRien()
    {
        var context = Apply("/api/admin/stats");

        Assert.Equal(SecurityHeaders.ApiContentSecurityPolicy, context.Response.Headers.ContentSecurityPolicy);
        Assert.Equal("nosniff", context.Response.Headers.XContentTypeOptions);
        Assert.Equal("DENY", context.Response.Headers.XFrameOptions);
        Assert.Equal("no-referrer", context.Response.Headers["Referrer-Policy"]);
        Assert.Equal("max-age=31536000", context.Response.Headers.StrictTransportSecurity);
        Assert.Equal("no-store", context.Response.Headers.CacheControl);
    }

    [Fact]
    public void Api_GardeLeCacheControlPoseParLaRoute()
    {
        var context = new DefaultHttpContext();
        context.Response.Headers.CacheControl = "no-cache, no-store";

        SecurityHeaders.Apply(context.Response.Headers, isDashboard: false);

        Assert.Equal("no-cache, no-store", context.Response.Headers.CacheControl);
    }

    [Fact]
    public void TableauDeBord_PasDeNoStore() =>
        Assert.True(string.IsNullOrEmpty(Apply("/jobs/js18250.js").Response.Headers.CacheControl));

    [Theory]
    [InlineData("/jobs")]
    [InlineData("/jobs/recurring")]
    [InlineData("/jobs/js18250.js")]
    public void TableauDeBord_CspPropre(string path) =>
        Assert.Equal(SecurityHeaders.DashboardContentSecurityPolicy, Apply(path).Response.Headers.ContentSecurityPolicy);

    [Fact]
    public void UnCheminQuiCommenceSeulementParJobs_GardeLaCspDeLApi() =>
        Assert.Equal(SecurityHeaders.ApiContentSecurityPolicy, Apply("/jobsxyz").Response.Headers.ContentSecurityPolicy);

    [Fact]
    public void TableauDeBord_PasDeScriptEnLigneAutorise()
    {
        var scriptSrc = SecurityHeaders.DashboardContentSecurityPolicy.Split(';')
            .Select(d => d.Trim()).Single(d => d.StartsWith("script-src", StringComparison.Ordinal));

        Assert.DoesNotContain("unsafe", scriptSrc);
    }

    private static DefaultHttpContext Apply(string path)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        SecurityHeaders.Apply(context.Response.Headers, SecurityHeaders.IsDashboard(context.Request.Path));
        return context;
    }
}
