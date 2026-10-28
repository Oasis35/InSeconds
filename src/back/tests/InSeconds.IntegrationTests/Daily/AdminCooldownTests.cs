using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Application;
using Microsoft.Extensions.DependencyInjection;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// Le cooldown des morceaux, **déduit de la taille du pool** (#275) : la part du pool en cooldown (<c>Daily:TrackCooldownPoolPercent</c>),
/// réglée par l'admin et **relue à chaud**, donne des jours qui suivent le pool jouable. La valeur écrite s'applique tout de suite au
/// tirage et à la date de déblocage du pool, sans redémarrage.
/// </summary>
public class AdminCooldownTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string SettingsRoute = "/api/admin/daily/settings";
    private const string CooldownRoute = "/api/admin/daily/settings/track-cooldown-pool-percent";
    private const string SettingKey = "Daily:TrackCooldownPoolPercent";

    private GameApi _game = null!;

    // 100 morceaux jouables : 75 % du pool, 5 morceaux par défi, soit 15 jours de cooldown.
    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 100);

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private Task<HttpResponseMessage> PutAsync(int percent) =>
        _game.App.Admin().PutAsJsonAsync(CooldownRoute, new UpdateTrackCooldownPoolPercent(percent), Ct);

    private async Task<AdminDailySettingsResponse> CurrentAsync() =>
        (await _game.App.Admin().GetFromJsonAsync<AdminDailySettingsResponse>(SettingsRoute, Ct))!;

    private Task<long> SettingRowsAsync() => _game.Api.ScalarAsync<long>($"SELECT count(*) FROM infra.settings WHERE key = '{SettingKey}'");

    [Fact]
    public async Task SansReglage_TroisQuartsDuPool_SoitQuinzeJoursPourCentMorceaux()
    {
        Assert.Equal(new AdminDailySettingsResponse(75, 15, 100), await CurrentAsync());
    }

    [Fact]
    public async Task LeCooldown_SuitLaTailleDuPool()
    {
        await _game.App.AddPlayableTracksAsync(100, firstId: 101);
        Assert.Equal(new AdminDailySettingsResponse(75, 30, 200), await CurrentAsync());

        // Désactivés ou sans extrait : ils ne comptent pas dans le pool jouable.
        await _game.App.AddTracksAsync(50, firstId: 201, previewStatus: 1, disabled: true);
        await _game.App.AddTracksAsync(50, firstId: 251, previewStatus: 2);
        Assert.Equal(new AdminDailySettingsResponse(75, 30, 200), await CurrentAsync());
    }

    [Fact]
    public async Task LeCooldown_SuitLeNombreDeMorceauxParDefi()
    {
        await _game.SetSettingAsync("Daily:TracksPerChallenge", "3");

        Assert.Equal(25, (await CurrentAsync()).TrackCooldownDays);
    }

    [Fact]
    public async Task Changer_RendLeCooldownQuiEnResulte_EtLEnregistreEnBase()
    {
        var response = await PutAsync(50);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new AdminDailySettingsResponse(50, 10, 100), await response.Content.ReadFromJsonAsync<AdminDailySettingsResponse>(Ct));
        Assert.Equal("50", await _game.Api.ScalarAsync<string>($"SELECT value::text FROM infra.settings WHERE key = '{SettingKey}'"));
        Assert.Equal(new AdminDailySettingsResponse(50, 10, 100), await CurrentAsync());
    }

    [Fact]
    public async Task Changer_ParDeuxFois_MetAJourLaMemeLigne()
    {
        await PutAsync(40);
        await PutAsync(60);

        Assert.Equal(1L, await SettingRowsAsync());
        Assert.Equal(60, (await CurrentAsync()).TrackCooldownPoolPercent);
    }

    [Fact]
    public async Task ARechaud_LeTirageDuJourLitLaNouvelleValeurSansRedemarrage()
    {
        // 50 morceaux tirés ces 10 derniers jours : tous en cooldown (15 jours), 50 restent tirables.
        for (var i = 0; i < 10; i++)
            await _game.App.AddChallengeAsync(Today.AddDays(-1 - i), Enumerable.Range((i * 5) + 1, 5).ToArray());
        Assert.Equal(50, (await _game.App.GenerateAsync(Today.AddDays(1))).EligibleCount);

        Assert.Equal(HttpStatusCode.OK, (await PutAsync(10)).StatusCode);

        // 10 % : 2 jours. Pour le défi d'après-demain, seuls les 5 morceaux de demain restent exclus.
        Assert.Equal(95, (await _game.App.GenerateAsync(Today.AddDays(2))).EligibleCount);
    }

    [Fact]
    public async Task ARechaud_LaDateDeDeblocageDuPoolSuitLeReglage()
    {
        await _game.App.AddChallengeAsync(Today.AddDays(-10), 1, 2, 3, 4, 5);
        // Tiré il y a 10 jours, 15 jours de cooldown : tirable de nouveau dans 6 jours (le lendemain de dernier usage + cooldown).
        Assert.Equal(Today.AddDays(6), (await UsageAsync(1)).UnlockDate);

        await PutAsync(10);

        // 10 % de 100 morceaux, 5 par défi : 2 jours.
        Assert.Equal(Today.AddDays(-7), (await UsageAsync(1)).UnlockDate);
    }

    [Fact]
    public async Task UnDefiDejaGenere_NeChangePas()
    {
        await _game.GenerateAsync();
        var before = await _game.App.TracksOfAsync(Today);

        await PutAsync(10);

        Assert.Equal(before, await _game.App.TracksOfAsync(Today));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(9)]
    [InlineData(91)]
    [InlineData(100)]
    public async Task ValeurHorsLimites_400_RienNEstEnregistre(int percent)
    {
        var response = await PutAsync(percent);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0L, await SettingRowsAsync());
        Assert.Equal(75, (await CurrentAsync()).TrackCooldownPoolPercent);
    }

    [Theory]
    [InlineData(10)]
    [InlineData(90)]
    public async Task LesLimitesSontAcceptees(int percent)
    {
        Assert.Equal(HttpStatusCode.OK, (await PutAsync(percent)).StatusCode);
        Assert.Equal(percent, (await CurrentAsync()).TrackCooldownPoolPercent);
    }

    [Fact]
    public async Task UneValeurAberranteEnBase_MontreCeQuiSAppliqueVraiment()
    {
        await _game.SetSettingAsync(SettingKey, "100");

        // Le tirage retombe sur la valeur par défaut : on affiche celle-là, pas la valeur écrite.
        Assert.Equal(new AdminDailySettingsResponse(75, 15, 100), await CurrentAsync());
    }

    [Fact]
    public async Task ReserveAUnAdmin_401Et403()
    {
        foreach (var (method, route) in new[] { (HttpMethod.Get, SettingsRoute), (HttpMethod.Put, CooldownRoute) })
        {
            using var anonymous = new HttpRequestMessage(method, route) { Content = Body(method) };
            Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().SendAsync(anonymous, Ct)).StatusCode);

            using var player = new HttpRequestMessage(method, route) { Content = Body(method) };
            Assert.Equal(HttpStatusCode.Forbidden, (await _game.Api.CreateClient(TestUser.Player).SendAsync(player, Ct)).StatusCode);
        }

        // Aucune des deux requêtes refusées n'a écrit quoi que ce soit.
        Assert.Equal(0L, await SettingRowsAsync());

        static JsonContent? Body(HttpMethod method) => method == HttpMethod.Put ? JsonContent.Create(new UpdateTrackCooldownPoolPercent(50)) : null;
    }

    private async Task<TrackUsage> UsageAsync(int trackId)
    {
        using var scope = _game.Api.Services.CreateScope();
        var usage = await scope.ServiceProvider.GetRequiredService<IDailyTrackUsage>().GetAsync([trackId], Ct);
        return usage[trackId];
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
