using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Infrastructure.Observability;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.UnitTests.Infrastructure.Observability;

/// <summary>Un code de lien (invitation d'un groupe, playlist d'un ami) n'entre ni dans une trace ni dans un journal.</summary>
public class SecretPathsTests
{
    [Theory]
    [InlineData("/api/social/invitations/ABCD2345", "/api/social/invitations/{code}")]
    [InlineData("/api/social/invitations/ABCD2345/join", "/api/social/invitations/{code}/join")]
    [InlineData("/api/runs/challenges/K7P2QX/comparison", "/api/runs/challenges/{code}/comparison")]
    [InlineData("/ranking/join/ABCD2345", "/ranking/join/{code}")]
    [InlineData("/setlist/K7P2QX", "/setlist/{code}")]
    [InlineData("/runs/K7P2QX", "/runs/{code}")]
    [InlineData("/Setlist/K7P2QX", "/setlist/{code}")]
    [InlineData("https://api.inseconds.cc/api/social/invitations/ABCD2345/join", "https://api.inseconds.cc/api/social/invitations/{code}/join")]
    [InlineData("https://inseconds.cc/setlist/K7P2QX?group=X", "https://inseconds.cc/setlist/{code}?group=X")]
    public void Mask_RemplaceLeCode(string path, string expected) => Assert.Equal(expected, LinkSecrets.Paths.Mask(path));

    [Theory]
    [InlineData("/setlist")]
    [InlineData("/setlist/")]
    [InlineData("/setlist/history")]
    [InlineData("/setlist/history/42")]
    [InlineData("/setlist/hits")]
    [InlineData("/setlistx/K7P2QX")]
    [InlineData("/daily")]
    [InlineData("/api/social/groups/3")]
    [InlineData("https://inseconds.cc/setlist/history")]
    [InlineData(null)]
    public void Mask_LaisseLesAutresChemins(string? path) => Assert.Equal(path, LinkSecrets.Paths.Mask(path));

    [Fact]
    public void LesScopesDesLogs_MasquentLeCheminDeLaRequete()
    {
        var scopes = new LoggerExternalScopeProvider();
        var masking = new SecretPathScopeProvider(scopes, LinkSecrets.Paths);
        using var request = scopes.Push(new KeyValuePair<string, object?>[] { new("RequestId", "r1"), new("RequestPath", "/api/social/invitations/ABCD2345/join") });
        using var player = scopes.Push(new KeyValuePair<string, object?>[] { new("PlayerId", "p1") });

        var seen = new List<KeyValuePair<string, object?>>();
        masking.ForEachScope((scope, list) => list.AddRange((IEnumerable<KeyValuePair<string, object?>>)scope!), seen);

        Assert.Contains(new KeyValuePair<string, object?>("RequestPath", "/api/social/invitations/{code}/join"), seen);
        Assert.Contains(new KeyValuePair<string, object?>("RequestId", "r1"), seen);
        Assert.Contains(new KeyValuePair<string, object?>("PlayerId", "p1"), seen);
        Assert.DoesNotContain(seen, kv => kv.Value is string text && text.Contains("ABCD2345"));
    }

    [Fact]
    public void LeFournisseurDeLogsOpenTelemetry_EstEnveloppe()
    {
        var builder = WebApplication.CreateBuilder();
        builder.AddInSecondsObservability("test", LinkSecrets.Paths);
        using var services = builder.Services.BuildServiceProvider();

        var providers = services.GetServices<ILoggerProvider>().ToList();
        Assert.Contains(providers, p => p is SecretPathLoggerProvider wrapped && wrapped.Inner.GetType().Name == "OpenTelemetryLoggerProvider");
        Assert.DoesNotContain(providers, p => p.GetType().Name == "OpenTelemetryLoggerProvider");
    }
}
