using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Operations;

namespace InSeconds.IntegrationTests.Operations;

/// <summary>
/// <c>GET /api/admin/system</c> : le commit de l'API et la dernière sauvegarde de la base, affichés dans le panneau technique de l'admin.
/// La sauvegarde est inscrite dans <c>infra.backup_runs</c> par <c>deploy/infra/backup.sh</c>, hors de l'API.
/// </summary>
public class SystemInfoTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/api/admin/system";

    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync() => _api = new ApiFactory(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    private async Task<SystemInfoResponse> ReadAsync()
    {
        var response = await _api.CreateClient(TestUser.Admin).GetAsync(Route, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SystemInfoResponse>(Ct))!;
    }

    [Fact]
    public async Task SansSauvegardeNiCommit_ToutEstVide()
    {
        var info = await ReadAsync();

        Assert.Equal((null, null, null), (info.Commit, info.LastBackupAt, info.LastBackupOffSite));
    }

    [Fact]
    public async Task LaDerniereSauvegarde_LaPlusRecente_AvecSaDestination()
    {
        await _api.ExecuteAsync("""
            INSERT INTO infra.backup_runs (finished_at, off_site) VALUES
              ('2026-11-02 03:00:12+00', true),
              ('2026-11-04 03:00:41+00', false),
              ('2026-11-03 03:00:09+00', true)
            """);

        var info = await ReadAsync();

        Assert.Equal(new DateTimeOffset(2026, 11, 4, 3, 0, 41, TimeSpan.Zero), info.LastBackupAt);
        Assert.False(info.LastBackupOffSite);
    }

    [Fact]
    public async Task ReserveAUnAdmin_401Et403()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _api.CreateClient().GetAsync(Route, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _api.CreateClient(TestUser.Player).GetAsync(Route, Ct)).StatusCode);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
