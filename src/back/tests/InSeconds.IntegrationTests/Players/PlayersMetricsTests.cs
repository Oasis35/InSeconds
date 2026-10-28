using System.Diagnostics.Metrics;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.Metrics.Testing;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Les compteurs OpenTelemetry des joueurs (<see cref="PlayersMetrics"/>), lus par le tableau Grafana « Activité » : invités créés par
/// source d'arrivée, connexions par lien magique et comptes effacés, avec leur issue en étiquette et jamais l'identifiant du joueur.
/// </summary>
public class PlayersMetricsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private MagicLinkApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    private MetricCollector<long> Collect(string instrument) =>
        new(_app.Api.Services.GetRequiredService<IMeterFactory>(), PlayersMetrics.MeterName, instrument);

    [Fact]
    public async Task CreationDInvite_ParSourceDArrivee()
    {
        using var guests = Collect(PlayersMetrics.GuestsCreatedName);
        var browser = _app.Browser();

        (await browser.PostAsJsonAsync("/api/players/guest", new CreateGuest("TikTok"), TestContext.Current.CancellationToken))
            .EnsureSuccessStatusCode();
        // Navigateur déjà identifié : aucun invité de plus.
        (await browser.PostAsJsonAsync("/api/players/guest", new CreateGuest("share"), TestContext.Current.CancellationToken))
            .EnsureSuccessStatusCode();
        (await _app.Browser().PostAsync("/api/players/guest", null, TestContext.Current.CancellationToken)).EnsureSuccessStatusCode();

        Assert.Equal(["tiktok", "direct"], guests.GetMeasurementSnapshot().Select(m => (string?)m.Tags["source"]));
        Assert.All(guests.GetMeasurementSnapshot(), m => Assert.Equal(["source"], m.Tags.Keys));
    }

    [Fact]
    public async Task Connexion_CompteCreePuisRetrouve()
    {
        using var signIns = Collect(PlayersMetrics.SignInsName);

        await _app.SignInDeviceAsync("compte@example.com", "Compte");
        await _app.SignInDeviceAsync("compte@example.com");

        var outcomes = signIns.GetMeasurementSnapshot().Select(m => (string?)m.Tags["outcome"]);
        Assert.Equal(["Linked", "Found"], outcomes);
        Assert.All(signIns.GetMeasurementSnapshot(), m => Assert.Equal(["outcome"], m.Tags.Keys));
    }

    [Fact]
    public async Task Suppression_ParLeJoueur_EstComptee()
    {
        var device = await _app.SignInDeviceAsync("part@example.com", "Part");
        using var erased = Collect(PlayersMetrics.AccountsErasedName);

        (await device.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Part"), TestContext.Current.CancellationToken))
            .EnsureSuccessStatusCode();

        var measurement = Assert.Single(erased.GetMeasurementSnapshot());
        Assert.Equal((1L, "request"), (measurement.Value, (string?)measurement.Tags["reason"]));
    }
}
