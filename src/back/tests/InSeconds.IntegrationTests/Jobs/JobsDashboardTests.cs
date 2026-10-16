using System.Net;

namespace InSeconds.IntegrationTests.Jobs;

/// <summary>S3 : le tableau de bord Hangfire n'est ouvert qu'aux admins (401 sans joueur, 403 sans le rôle).</summary>
public class JobsDashboardTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync() => _api = new ApiFactory(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Theory]
    [InlineData("/jobs")]
    [InlineData("/jobs/recurring")]
    [InlineData("/jobs/stats")]
    public async Task Anonyme_401(string path)
    {
        var response = await _api.CreateClient().GetAsync(path, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("/jobs")]
    [InlineData("/jobs/recurring")]
    [InlineData("/jobs/stats")]
    public async Task JoueurNonAdmin_403(string path)
    {
        var response = await _api.CreateClient(TestUser.Player).GetAsync(path, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admin_VoitLeTableauDeBord()
    {
        var response = await _api.CreateClient(TestUser.Admin).GetAsync("/jobs", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("InSeconds", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task ActionSansJetonAntiforgery_Refusee()
    {
        // « Lancer maintenant » depuis un autre site : l'admin est connecté, mais le jeton manque.
        var response = await _api.CreateClient(TestUser.Admin).PostAsync(
            "/jobs/recurring/trigger", new FormUrlEncodedContent([new("jobs[]", "une-tache")]),
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
