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
        Assert.Equal((null, null, null), (info.BackupFailure, info.LastRestoreTestAt, info.RestoreTestFailure));
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
    public async Task SauvegardeEnEchec_DerniereReussieGardee_EtEchecDonne()
    {
        await _api.ExecuteAsync("""
            INSERT INTO infra.backup_runs (kind, outcome, finished_at, off_site) VALUES ('backup', 'ok', '2026-11-03 03:00:09+00', true);
            INSERT INTO infra.backup_runs (kind, outcome, finished_at, failed_step, message)
              VALUES ('backup', 'failed', '2026-11-04 03:00:30+00', 'dump', 'étape 1/3 dump : dump vide');
            """);

        var info = await ReadAsync();

        Assert.Equal(new DateTimeOffset(2026, 11, 3, 3, 0, 9, TimeSpan.Zero), info.LastBackupAt);
        Assert.True(info.LastBackupOffSite);
        Assert.Equal(new BackupFailureResponse(new DateTimeOffset(2026, 11, 4, 3, 0, 30, TimeSpan.Zero), "dump", "étape 1/3 dump : dump vide"), info.BackupFailure);
    }

    [Fact]
    public async Task ControleDeRestauration_DernierReussi_EtEchecEffaceParUneReussite()
    {
        await _api.ExecuteAsync("""
            INSERT INTO infra.backup_runs (kind, outcome, finished_at, failed_step, message)
              VALUES ('verify', 'failed', '2026-11-03 04:01:00+00', 'freshness', 'trop vieille');
            INSERT INTO infra.backup_runs (kind, outcome, finished_at, dump_name)
              VALUES ('verify', 'ok', '2026-11-04 04:01:37+00', 'daily/inseconds-2026-11-04T030001Z.dump');
            INSERT INTO infra.backup_runs (kind, outcome, finished_at, off_site) VALUES ('archive', 'ok', '2026-11-04 10:00:00+00', true);
            """);

        var info = await ReadAsync();

        Assert.Equal(new DateTimeOffset(2026, 11, 4, 4, 1, 37, TimeSpan.Zero), info.LastRestoreTestAt);
        Assert.Null(info.RestoreTestFailure);
        // Une archive faite à la main n'est pas la sauvegarde de la nuit.
        Assert.Null(info.LastBackupAt);
    }

    [Fact]
    public async Task ReserveAUnAdmin_401Et403()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _api.CreateClient().GetAsync(Route, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _api.CreateClient(TestUser.Player).GetAsync(Route, Ct)).StatusCode);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
