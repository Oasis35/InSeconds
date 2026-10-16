using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Application;
using Microsoft.Extensions.DependencyInjection;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Le réglage du cooldown des morceaux (F1, v1 : <c>PUT /api/admin/settings/track-cooldown-days</c>), **relu à chaud** (R13) : la valeur écrite par
/// l'admin s'applique tout de suite au tirage et à la date de déblocage du pool, sans redémarrage.
/// </summary>
public class AdminCooldownTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string SettingsRoute = "/api/admin/daily/settings";
    private const string CooldownRoute = "/api/admin/daily/settings/track-cooldown-days";

    private GameApi _game = null!;

    // Un pool de cinq morceaux seulement : tous servent à chaque défi, donc le cooldown décide seul s'il y a un défi ou non.
    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 5);

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private Task<HttpResponseMessage> PutAsync(int days) => _game.App.Admin().PutAsJsonAsync(CooldownRoute, new UpdateTrackCooldown(days), Ct);

    private async Task<int> CurrentAsync() =>
        (await _game.App.Admin().GetFromJsonAsync<AdminDailySettingsResponse>(SettingsRoute, Ct))!.TrackCooldownDays;

    [Fact]
    public async Task SansReglage_LaValeurParDefautDeLaV1_TrenteJours()
    {
        Assert.Equal(30, await CurrentAsync());
    }

    [Fact]
    public async Task Changer_RendLaNouvelleValeur_EtLEnregistreEnBase()
    {
        var response = await PutAsync(45);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(45, (await response.Content.ReadFromJsonAsync<AdminDailySettingsResponse>(Ct))!.TrackCooldownDays);
        Assert.Equal("45", await _game.Api.ScalarAsync<string>("SELECT value::text FROM infra.settings WHERE key = 'Daily:TrackCooldownDays'"));
        Assert.Equal(45, await CurrentAsync());
    }

    [Fact]
    public async Task Changer_ParDeuxFois_MetAJourLaMemeLigne()
    {
        await PutAsync(10);
        await PutAsync(20);

        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM infra.settings WHERE key = 'Daily:TrackCooldownDays'"));
        Assert.Equal(20, await CurrentAsync());
    }

    [Fact]
    public async Task ARechaud_LeTirageDuJourLitLaNouvelleValeurSansRedemarrage()
    {
        // Les cinq morceaux ont servi il y a trois jours : avec 30 jours de cooldown, aucun n'est tirable.
        await _game.App.AddChallengeAsync(Today.AddDays(-3), 1, 2, 3, 4, 5);
        Assert.Equal(GenerationOutcome.PoolInsufficient, (await _game.App.GenerateAsync()).Outcome);

        Assert.Equal(HttpStatusCode.OK, (await PutAsync(1)).StatusCode);

        Assert.Equal(GenerationOutcome.Created, (await _game.App.GenerateAsync()).Outcome);
    }

    [Fact]
    public async Task ARechaud_LaDateDeDeblocageDuPoolSuitLeReglage()
    {
        await _game.App.AddChallengeAsync(Today.AddDays(-10), 1, 2, 3, 4, 5);
        Assert.Equal(Today.AddDays(20), (await UsageAsync(1)).UnlockDate);

        await PutAsync(7);

        Assert.Equal(Today.AddDays(-3), (await UsageAsync(1)).UnlockDate);
    }

    [Fact]
    public async Task UnDefiDejaGenere_NeChangePas()
    {
        await _game.GenerateAsync();
        var before = await _game.App.TracksOfAsync(Today);

        await PutAsync(1);

        Assert.Equal(before, await _game.App.TracksOfAsync(Today));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(3651)]
    public async Task ValeurHorsLimites_400_RienNEstEnregistre(int days)
    {
        var response = await PutAsync(days);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM infra.settings WHERE key = 'Daily:TrackCooldownDays'"));
        Assert.Equal(30, await CurrentAsync());
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3650)]
    public async Task LesLimitesSontAcceptees(int days)
    {
        Assert.Equal(HttpStatusCode.OK, (await PutAsync(days)).StatusCode);
        Assert.Equal(days, await CurrentAsync());
    }

    [Fact]
    public async Task UneValeurAberranteEnBase_MontreCeQuiSAppliqueVraiment()
    {
        await _game.SetSettingAsync("Daily:TrackCooldownDays", "-3");

        // Le tirage retombe sur la valeur par défaut : on affiche celle-là, pas la valeur écrite.
        Assert.Equal(30, await CurrentAsync());
    }

    [Fact]
    public async Task ReserveAUnAdmin_401Et403()
    {
        foreach (var (method, route) in new[] { (HttpMethod.Get, SettingsRoute), (HttpMethod.Put, CooldownRoute) })
        {
            using var anonymous = new HttpRequestMessage(method, route) { Content = method == HttpMethod.Put ? JsonContent.Create(new UpdateTrackCooldown(5)) : null };
            Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().SendAsync(anonymous, Ct)).StatusCode);

            using var player = new HttpRequestMessage(method, route) { Content = method == HttpMethod.Put ? JsonContent.Create(new UpdateTrackCooldown(5)) : null };
            Assert.Equal(HttpStatusCode.Forbidden, (await _game.Api.CreateClient(TestUser.Player).SendAsync(player, Ct)).StatusCode);
        }

        // Aucune des deux requêtes refusées n'a écrit quoi que ce soit.
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM infra.settings WHERE key = 'Daily:TrackCooldownDays'"));
    }

    private async Task<TrackUsage> UsageAsync(int trackId)
    {
        using var scope = _game.Api.Services.CreateScope();
        var usage = await scope.ServiceProvider.GetRequiredService<ITrackUsage>().GetAsync([trackId], Ct);
        return usage[trackId];
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
