using System.Net;
using System.Text.Json;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Infrastructure.Networking;
using InSeconds.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace InSeconds.IntegrationTests.Security;

/// <summary>
/// IP réelle du joueur derrière Cloudflare puis Caddy (piège 27) et rate limiting par IP, sur un
/// pipeline dans le même ordre que l'API (<c>ApiComposition.UseInSecondsApi</c>). Le serveur de test
/// n'a pas d'IP TCP : l'en-tête <see cref="TcpSourceHeader"/> la simule.
/// </summary>
public sealed class ForwardedHeadersAndRateLimitingTests : IAsyncLifetime
{
    private const string TcpSourceHeader = "X-Test-Tcp-Source";
    private const string Caddy = "172.18.0.5";
    private const string CloudflareEdge = "162.158.1.1";
    private WebApplication _app = null!;
    private HttpClient _client = null!;

    public async ValueTask InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = Environments.Production });
        builder.WebHost.UseTestServer();
        builder.Services.AddInSecondsProblemDetails();
        builder.Services.AddInSecondsForwardedHeaders();
        builder.Services.AddInSecondsRateLimiting(builder.Configuration);

        _app = builder.Build();
        _app.Use((context, next) =>
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(context.Request.Headers[TcpSourceHeader].ToString());
            return next(context);
        });
        _app.UseForwardedHeaders();
        _app.UseInSecondsErrorHandling();
        _app.UseRateLimiter();
        _app.MapGet("/ip", (HttpContext context) => context.Connection.RemoteIpAddress!.ToString());
        _app.MapGet("/limited", () => "ok").RequireRateLimiting(RateLimitPolicies.MagicLinkRequest);

        await _app.StartAsync(TestContext.Current.CancellationToken);
        _client = _app.GetTestClient();
    }

    public async ValueTask DisposeAsync() => await _app.DisposeAsync();

    [Fact]
    public async Task DerriereCloudflareEtCaddy_IpDuJoueur()
    {
        Assert.Equal("203.0.113.7", await GetIpAsync(Caddy, "203.0.113.7, " + CloudflareEdge));
    }

    [Fact]
    public async Task EnTeteForgeParUnJoueurQuiContourneCloudflare_IgnorePourSaVraieIp()
    {
        Assert.Equal("198.51.100.9", await GetIpAsync("198.51.100.9", "203.0.113.7"));
    }

    [Fact]
    public async Task EnTeteForgeDerriereCloudflare_OnSArreteAuPremierSautNonFiable()
    {
        // Le joueur envoie lui-même « X-Forwarded-For: 1.2.3.4 », Cloudflare ajoute sa vraie IP.
        Assert.Equal("203.0.113.7", await GetIpAsync(Caddy, "1.2.3.4, 203.0.113.7, " + CloudflareEdge));
    }

    [Fact]
    public async Task RateLimiting_ParJoueur_PasParEdgeCloudflare_429AuFormatProblemDetails()
    {
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.OK, (await GetLimitedAsync("203.0.113.10")).StatusCode);

        var rejected = await GetLimitedAsync("203.0.113.10");
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);
        var problem = JsonDocument.Parse(await rejected.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)).RootElement;
        Assert.Equal(ErrorCodes.ForStatus(429), problem.GetProperty("code").GetString());
        Assert.True(problem.TryGetProperty("traceId", out _));

        // Même edge Cloudflare, autre joueur : pas concerné.
        Assert.Equal(HttpStatusCode.OK, (await GetLimitedAsync("203.0.113.11")).StatusCode);
    }

    private async Task<string> GetIpAsync(string tcpSource, string forwardedFor)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/ip");
        request.Headers.Add(TcpSourceHeader, tcpSource);
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        var response = await _client.SendAsync(request, TestContext.Current.CancellationToken);
        return await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
    }

    private Task<HttpResponseMessage> GetLimitedAsync(string playerIp)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/limited");
        request.Headers.Add(TcpSourceHeader, Caddy);
        request.Headers.Add("X-Forwarded-For", $"{playerIp}, {CloudflareEdge}");
        return _client.SendAsync(request, TestContext.Current.CancellationToken);
    }
}

/// <summary>Désactivé par la configuration (environnement Testing) : la politique ne limite plus rien.</summary>
public sealed class RateLimitingDisabledTests : IAsyncLifetime
{
    private WebApplication _app = null!;

    public async ValueTask InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration["RateLimiting:Enabled"] = "false";
        builder.Services.AddInSecondsRateLimiting(builder.Configuration);
        _app = builder.Build();
        _app.UseRateLimiter();
        _app.MapGet("/limited", () => "ok").RequireRateLimiting(RateLimitPolicies.MagicLinkRequest);
        await _app.StartAsync(TestContext.Current.CancellationToken);
    }

    public async ValueTask DisposeAsync() => await _app.DisposeAsync();

    [Fact]
    public async Task AucuneLimite()
    {
        var client = _app.GetTestClient();
        for (var i = 0; i < 20; i++)
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/limited", TestContext.Current.CancellationToken)).StatusCode);
    }
}
