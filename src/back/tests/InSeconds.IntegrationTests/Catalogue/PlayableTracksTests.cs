using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using Microsoft.Extensions.DependencyInjection;
using static InSeconds.IntegrationTests.Catalogue.CatalogueApi;

namespace InSeconds.IntegrationTests.Catalogue;

/// <summary>
/// Les morceaux jouables (<see cref="ITrackDirectory.ListPlayableIdsAsync"/>) : ceux que le Daily et la Survie ont le droit de tirer. Non désactivés et
/// extrait disponible, triés par identifiant : le tirage du défi en dépend (piège 16 : un extrait de statut inconnu ou absent ne se tire pas).
/// </summary>
public class PlayableTracksTests(PostgresFixture postgres) : IAsyncLifetime
{
    private CatalogueApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = CatalogueApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
        // Insérés dans le désordre : 1 jouable, 2 désactivé, 3 jouable, 4 sans extrait, 5 d'état inconnu, 6 jouable.
        await _app.Api.ExecuteAsync("""
            INSERT INTO catalogue.tracks (id, deezer_track_id, artist, title, preview_status, disabled_at, created_at) VALUES
              (6, 1006, 'A', 'T6', 1, NULL, now()), (3, 1003, 'A', 'T3', 1, NULL, now()), (5, 1005, 'A', 'T5', 0, NULL, now()),
              (1, 1001, 'A', 'T1', 1, NULL, now()), (4, 1004, 'A', 'T4', 2, NULL, now()), (2, 1002, 'A', 'T2', 1, now(), now())
            """);
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    private async Task<IReadOnlyList<int>> PlayableAsync()
    {
        using var scope = _app.Api.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ITrackDirectory>().ListPlayableIdsAsync(Ct);
    }

    [Fact]
    public async Task Jouables_SansLesDesactives_NiLesSansExtrait_NiLEtatInconnu_TrieesParIdentifiant() =>
        Assert.Equal([1, 3, 6], await PlayableAsync());

    [Fact]
    public async Task Desactiver_RetireLeMorceauDesJouables_ReactiverLeRend()
    {
        (await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/3/disabled", new SetTrackDisabled(true), Ct)).EnsureSuccessStatusCode();
        Assert.Equal([1, 6], await PlayableAsync());

        (await _app.Admin().PutAsJsonAsync("/api/admin/catalogue/tracks/3/disabled", new SetTrackDisabled(false), Ct)).EnsureSuccessStatusCode();
        Assert.Equal([1, 3, 6], await PlayableAsync());
    }

    [Fact]
    public async Task UnExtraitRetireChezDeezer_NEstPlusJouable_PuisLeDevientQuandIlRevient()
    {
        await _app.Api.ExecuteAsync("UPDATE catalogue.tracks SET preview_status = 2 WHERE id = 1");
        Assert.Equal([3, 6], await PlayableAsync());

        await _app.Api.ExecuteAsync("UPDATE catalogue.tracks SET preview_status = 1 WHERE id = 1");
        Assert.Equal([1, 3, 6], await PlayableAsync());
    }

    [Fact]
    public async Task UnPoolVide_NeDonneAucunMorceau_SansErreur()
    {
        await _app.Api.ExecuteAsync("DELETE FROM catalogue.tracks");

        Assert.Empty(await PlayableAsync());
    }
}
