using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Les droits RGPD avec **deux modes de jeu** : Players ne connaît aucun mode, il appelle chaque
/// <see cref="IPlayerDataContributor"/> enregistré. Le Daily est le vrai, un second mode (« autre », comme le sera Runs) est un faux qui note ses appels.
/// </summary>
public class PlayerDataContributorsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly OtherModeLog _log = new();

    private MagicLinkApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = MagicLinkApi.Create(
            await postgres.CreateDatabaseAsync(), recordGrants: false,
            configureServices: services => services.AddScoped<IPlayerDataContributor>(sp => new OtherMode(sp.GetRequiredService<InSecondsDbContext>(), _log)));
        _ = _app.Api.Server;
        await PlayerDataSeed.AddChallengeAsync(_app.Api);
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task Export_UneSectionParMode_DansLOrdreDEnregistrement()
    {
        var device = await _app.SignInDeviceAsync("deux@example.com", "Deux");
        await PlayerDataSeed.AddGameAsync(_app.Api, device.PlayerId);

        var export = (await device.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        Assert.Equal(["daily", "autre"], export.Modules.Keys);
        Assert.Single(ExportReading.Daily(export).Games);
        Assert.Equal(3, ExportReading.Section<OtherSection>(export, "autre").Rounds);
        Assert.Equal([device.PlayerId], _log.Exported);
    }

    [Fact]
    public async Task Export_NeDemandeAuxModesQueLesDonneesDuJoueurCourant()
    {
        var alice = await _app.SignInDeviceAsync("alice@example.com", "Alice");
        await _app.SignInDeviceAsync("bob@example.com", "Bob");

        (await alice.Client.GetAsync("/api/players/me/export", Ct)).EnsureSuccessStatusCode();

        Assert.Equal([alice.PlayerId], _log.Exported);
    }

    [Fact]
    public async Task Suppression_ChaqueModeEffaceSesDonnees_AvantLaLigneDuJoueur_LesAutresJoueursNeSontPasTouches()
    {
        var device = await _app.SignInDeviceAsync("efface@example.com", "Efface");
        var other = await _app.SignInDeviceAsync("reste@example.com", "Reste");
        await PlayerDataSeed.AddGameAsync(_app.Api, device.PlayerId);
        await PlayerDataSeed.AddGameAsync(_app.Api, other.PlayerId);

        var response = await device.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Efface"), Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        // Le second mode a été appelé pour ce joueur seulement, et sa ligne existait encore dans la transaction (les données des modes la référencent).
        Assert.Equal([device.PlayerId], _log.Deleted);
        Assert.Equal(1L, _log.PlayerRowsWhenDeleting);
        // Le Daily a effacé les siennes comme avant ; ni le compte ni les parties de l'autre joueur n'ont bougé.
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM daily.sessions WHERE player_id = '{device.PlayerId}'"));
        Assert.Equal(1L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM daily.sessions WHERE player_id = '{other.PlayerId}'"));
        Assert.Equal(0L, await _app.Api.ScalarAsync<long>($"SELECT count(*) FROM players.players WHERE id = '{device.PlayerId}'"));
    }

    [Fact]
    public async Task Suppression_UnModeQuiEchoue_NeLaisseRienAMoitieEffacee()
    {
        await using var failing = MagicLinkApi.Create(
            await postgres.CreateDatabaseAsync(), recordGrants: false,
            configureServices: services => services.AddScoped<IPlayerDataContributor>(_ => new FailingMode()));
        _ = failing.Api.Server;
        await PlayerDataSeed.AddChallengeAsync(failing.Api);
        var device = await failing.SignInDeviceAsync("garde@example.com", "Garde");
        await PlayerDataSeed.AddGameAsync(failing.Api, device.PlayerId);

        var response = await device.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Garde"), Ct);

        // Une seule transaction : le Daily, appelé avant le mode en échec, n'a rien effacé non plus, et le compte est toujours là.
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(1L, await failing.Api.ScalarAsync<long>($"SELECT count(*) FROM daily.sessions WHERE player_id = '{device.PlayerId}'"));
        Assert.Equal(1L, await failing.Api.ScalarAsync<long>($"SELECT count(*) FROM players.players WHERE id = '{device.PlayerId}'"));
    }

    [Fact]
    public async Task Export_DeuxModesDeMemeNom_RefuseDeFaireUneCopieIncomplete()
    {
        await using var duplicate = MagicLinkApi.Create(
            await postgres.CreateDatabaseAsync(), recordGrants: false,
            configureServices: services => services.AddScoped<IPlayerDataContributor>(_ => new DuplicateDailyMode()));
        _ = duplicate.Api.Server;
        var device = await duplicate.SignInDeviceAsync("double@example.com", "Double");

        var response = await device.Client.GetAsync("/api/players/me/export", Ct);

        // Deux sections de même nom : l'une écraserait l'autre et le joueur perdrait des données dans sa copie.
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record OtherSection(int Rounds);

    private sealed class OtherModeLog
    {
        public List<Guid> Exported { get; } = [];

        public List<Guid> Deleted { get; } = [];

        public long PlayerRowsWhenDeleting { get; set; } = -1;
    }

    /// <summary>Un second mode de jeu : il note qui il exporte et qui il efface, et vérifie la ligne du joueur depuis la transaction de l'appelant.</summary>
    private sealed class OtherMode(InSecondsDbContext db, OtherModeLog log) : IPlayerDataContributor
    {
        public string Module => "autre";

        public Task<object> ExportAsync(Guid playerId, CancellationToken ct)
        {
            log.Exported.Add(playerId);
            return Task.FromResult<object>(new OtherSection(3));
        }

        public async Task<int> DeleteAsync(Guid playerId, CancellationToken ct)
        {
            log.Deleted.Add(playerId);
            // Même contexte, donc même transaction que l'effacement de Players : la ligne du joueur n'est pas encore partie.
            log.PlayerRowsWhenDeleting = await db.Database
                .SqlQuery<long>($"SELECT count(*) AS \"Value\" FROM players.players WHERE id = {playerId}")
                .SingleAsync(ct);
            return 2;
        }
    }

    private sealed class FailingMode : IPlayerDataContributor
    {
        public string Module => "casse";

        public Task<object> ExportAsync(Guid playerId, CancellationToken ct) => Task.FromResult<object>(new { });

        public Task<int> DeleteAsync(Guid playerId, CancellationToken ct) => throw new InvalidOperationException("Mode en panne");
    }

    private sealed class DuplicateDailyMode : IPlayerDataContributor
    {
        public string Module => "daily";

        public Task<object> ExportAsync(Guid playerId, CancellationToken ct) => Task.FromResult<object>(new { });

        public Task<int> DeleteAsync(Guid playerId, CancellationToken ct) => Task.FromResult(0);
    }
}
