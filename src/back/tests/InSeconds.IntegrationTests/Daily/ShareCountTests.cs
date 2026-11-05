using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Les partages du score (<c>POST /api/daily/shares</c>) : comptés par jour de jeu et par format, sans rien noter du joueur, et lus par
/// l'encart « Partages » du tableau de bord de l'admin.
/// </summary>
public class ShareCountTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/api/daily/shares";

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 0);

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static Task<HttpResponseMessage> ShareAsync(HttpClient client, string format) =>
        client.PostAsJsonAsync(Route, new { format }, Ct);

    private async Task<DashboardSharesResponse> SharesAsync(DateOnly? day = null)
    {
        var query = day is { } d ? $"?date={d:yyyy-MM-dd}" : "";
        var response = await _game.App.Admin().GetAsync("/api/admin/daily/dashboard" + query, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<DashboardResponse>(Ct))!.Shares;
    }

    [Fact]
    public async Task Partages_ComptesParFormatEtParJourDeJeu()
    {
        var alice = await _game.NewPlayerAsync();
        var bob = await _game.NewPlayerAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await ShareAsync(alice.Client, "short")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ShareAsync(bob.Client, "short")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ShareAsync(bob.Client, "long")).StatusCode);

        Assert.Equal(new DashboardSharesResponse(new(2, 1), new(2, 1)), await SharesAsync());

        // Le lendemain : le jour affiché repart de zéro, les 30 jours cumulent.
        _game.Time.Advance(TimeSpan.FromDays(1));
        Assert.Equal(HttpStatusCode.NoContent, (await ShareAsync(alice.Client, "long")).StatusCode);

        Assert.Equal(new DashboardSharesResponse(new(0, 1), new(2, 2)), await SharesAsync());
        Assert.Equal(new ShareCountsResponse(2, 1), (await SharesAsync(Today)).SelectedDay);
    }

    [Fact]
    public async Task UnJourSansDefiNiPartage_ZeroPartout()
    {
        Assert.Equal(new DashboardSharesResponse(new(0, 0), new(0, 0)), await SharesAsync(Today.AddDays(-3)));
    }

    [Fact]
    public async Task UnPartageDePlusDeTrenteJours_HorsDesTrenteJours()
    {
        var alice = await _game.NewPlayerAsync();
        await ShareAsync(alice.Client, "short");
        _game.Time.Advance(TimeSpan.FromDays(30));

        Assert.Equal(new ShareCountsResponse(0, 0), (await SharesAsync()).Last30Days);
        Assert.Equal(new ShareCountsResponse(1, 0), (await SharesAsync(Today)).SelectedDay);
    }

    [Theory]
    [InlineData("medium")]
    [InlineData("")]
    [InlineData("SHORT")]
    public async Task FormatInconnu_400(string format)
    {
        var alice = await _game.NewPlayerAsync();

        Assert.Equal(HttpStatusCode.BadRequest, (await ShareAsync(alice.Client, format)).StatusCode);
        Assert.Equal(new ShareCountsResponse(0, 0), (await SharesAsync()).SelectedDay);
    }

    [Fact]
    public async Task SansJoueur_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await ShareAsync(_game.Api.CreateClient(), "short")).StatusCode);
    }

    [Fact]
    public async Task RateLimiting_20PartagesPar10MinutesEtParJoueur_PuisEn429()
    {
        await using var game = await GameApi.CreateAsync(
            await postgres.CreateDatabaseAsync(), tracks: 0, settings: new Dictionary<string, string> { ["RateLimiting:Enabled"] = "true" });
        var alice = await game.NewPlayerAsync();
        var bob = await game.NewPlayerAsync();

        for (var i = 0; i < 20; i++)
            Assert.Equal(HttpStatusCode.NoContent, (await ShareAsync(alice.Client, "short")).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await ShareAsync(alice.Client, "short")).StatusCode);
        // Par joueur : un autre joueur partage encore.
        Assert.Equal(HttpStatusCode.NoContent, (await ShareAsync(bob.Client, "short")).StatusCode);
    }
}
