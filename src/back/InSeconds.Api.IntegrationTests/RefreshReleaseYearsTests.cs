using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Features.Admin.RefreshReleaseYears;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class RefreshReleaseYearsTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task RefreshReleaseYears_SansAuth_Retourne401()
    {
        var resp = await _client.PostAsync("/api/admin/refresh-release-years", null);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task RefreshReleaseYears_PoolSeed_BackfillTousLesMorceaux()
    {
        // Le seed ne renseigne jamais ReleaseYear (créé directement en base, sans passer par
        // Deezer) — les 55 morceaux (utilisés ou non) sont candidats au backfill.
        var resp = await AdminPostAsync("/api/admin/refresh-release-years");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<RefreshReleaseYearsResponse>();
        Assert.NotNull(body);
        Assert.Equal(55, body.Checked);
        Assert.Equal(55, body.Updated);
        Assert.Equal(0, body.Failed);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await db.Tracks.AnyAsync(t => t.ReleaseYear == null));
    }

    [Fact]
    public async Task RefreshReleaseYears_DejaBackfille_SecondPassage_NeVerifieRien()
    {
        await AdminPostAsync("/api/admin/refresh-release-years");

        var resp = await AdminPostAsync("/api/admin/refresh-release-years");

        var body = await resp.Content.ReadFromJsonAsync<RefreshReleaseYearsResponse>();
        Assert.NotNull(body);
        Assert.Equal(0, body.Checked);
        Assert.Equal(0, body.Updated);
        Assert.Equal(0, body.Failed);
    }

    private Task<HttpResponseMessage> AdminPostAsync(string url)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        return _client.SendAsync(req);
    }
}
