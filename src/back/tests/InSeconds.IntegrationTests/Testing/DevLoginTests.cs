using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Testing.Auth;

namespace InSeconds.IntegrationTests.Testing;

/// <summary>Dev-login de l'hôte de test : connexion sans email, absente de l'API de prod (S9).</summary>
public class DevLoginTests(PostgresFixture postgres) : IAsyncLifetime
{
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task CreeLeCompteAvecLePseudo_PuisSeReconnecteSansPseudo()
    {
        await using var host = new TestingFactory(_connectionString);
        var first = host.CreateClient();

        var needsPseudo = await first.PostAsJsonAsync(DevLoginEndpoints.Route, new DevLoginRequest("dev@example.com", null), Ct);
        Assert.True((await needsPseudo.Content.ReadFromJsonAsync<VerifyMagicLinkResponse>(Ct))!.NeedsPseudo);
        var created = await first.PostAsJsonAsync(DevLoginEndpoints.Route, new DevLoginRequest("dev@example.com", "Dev"), Ct);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var me = await first.GetFromJsonAsync<PlayerMeResponse>("/api/players/me", Ct);
        Assert.Equal(("dev@example.com", "Dev", false), (me!.Email, me.Pseudo, me.IsGuest));

        var second = host.CreateClient();
        Assert.Equal(HttpStatusCode.OK,
            (await second.PostAsJsonAsync(DevLoginEndpoints.Route, new DevLoginRequest("DEV@example.com", null), Ct)).StatusCode);
        Assert.Equal(me.PlayerId, (await second.GetFromJsonAsync<PlayerMeResponse>("/api/players/me", Ct))!.PlayerId);
    }

    [Fact]
    public async Task AbsentDeLApi()
    {
        await using var api = new ApiFactory(_connectionString);

        var response = await api.CreateClient().PostAsJsonAsync(DevLoginEndpoints.Route, new DevLoginRequest("dev@example.com", "Dev"), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
