using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class HealthCheckTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── Liveness ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Health_RetourneStatusOkJson()
    {
        // Format { status, utc } consommé par le badge d'état backend du front (app.ts).
        var resp = await _client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("ok", body.GetProperty("status").GetString());
        Assert.NotEqual(default, body.GetProperty("utc").GetDateTime());
    }

    // ── Readiness (sonde DB) ─────────────────────────────────────────────────

    [Fact]
    public async Task HealthReady_AvecDbJoignable_RetourneHealthy()
    {
        var resp = await _client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Equal("Healthy", body);
    }

    [Fact]
    public async Task Health_ExposeLaDateDeBuild()
    {
        var resp = await _client.GetAsync("/health");

        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(string.IsNullOrEmpty(body.GetProperty("build").GetString()));
    }

    [Fact]
    public async Task Health_NeNecessitePasDAuth()
    {
        // Client neuf sans cookie joueur : les endpoints health restent publics.
        var freshClient = factory.CreateClient();

        var liveness = await freshClient.GetAsync("/health");
        var readiness = await freshClient.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, liveness.StatusCode);
        Assert.Equal(HttpStatusCode.OK, readiness.StatusCode);
    }
}
