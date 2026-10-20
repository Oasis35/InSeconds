using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Application;
using Microsoft.Extensions.DependencyInjection;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// L'usage des morceaux, **calculé** sur les défis (§ 4.4 du plan v2) : dernier jour, nombre d'apparitions, fin du cooldown,
/// présence dans le défi du jour, et les morceaux qu'un défi de tel jour ne peut pas tirer. C'est le <c>ITrackUsage</c> que
/// Catalogue lit pour le pool admin et pour le contrôle nocturne des extraits.
/// </summary>
public class TrackUsageTests(PostgresFixture postgres) : IAsyncLifetime
{
    private DailyApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = DailyApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
        // 200 morceaux jouables : 75 % du pool, 5 morceaux par défi, soit 30 jours de cooldown.
        await _app.AddPlayableTracksAsync(200);
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task MorceauJamaisTire_NAAucunUsage()
    {
        var usage = await GetAsync(1, 2);

        Assert.Empty(usage);
    }

    [Fact]
    public async Task Usage_DernierJour_Nombre_FinDuCooldown_EtDefiDuJour()
    {
        // La date de déblocage est le premier jour où le morceau est de nouveau tirable : dernier usage + 30 jours + 1.
        await _app.AddChallengeAsync(Today.AddDays(-40), 1, 2);
        await _app.AddChallengeAsync(Today.AddDays(-10), 1, 3);
        await _app.AddChallengeAsync(Today, 4, 5);

        var usage = await GetAsync(1, 2, 3, 4, 6);

        Assert.Equal(new TrackUsage(Today.AddDays(-10), 2, Today.AddDays(21), false), usage[1]);
        Assert.Equal(new TrackUsage(Today.AddDays(-40), 1, Today.AddDays(-9), false), usage[2]);
        Assert.Equal(new TrackUsage(Today.AddDays(-10), 1, Today.AddDays(21), false), usage[3]);
        Assert.Equal(new TrackUsage(Today, 1, Today.AddDays(31), true), usage[4]);
        Assert.False(usage.ContainsKey(6));
        Assert.True(usage[4].IsUsed);
    }

    [Fact]
    public async Task FinDuCooldown_SuitLeReglageLuAChaud()
    {
        await _app.AddChallengeAsync(Today.AddDays(-10), 1);
        await _app.Api.ExecuteAsync("""INSERT INTO infra.settings (key, value, description, updated_at) VALUES ('Daily:TrackCooldownPoolPercent', '10', '', now())""");
        _app.Api.Services.GetRequiredService<InSeconds.Api.Infrastructure.Settings.ISettingsReloader>().Reload();

        // 10 % de 200 morceaux, 5 par défi : 4 jours.
        Assert.Equal(Today.AddDays(-5), (await GetAsync(1))[1].UnlockDate);
    }

    [Fact]
    public async Task DefiDuJour_SuitLHorloge()
    {
        await _app.AddChallengeAsync(Today, 1);
        Assert.True((await GetAsync(1))[1].InTodayChallenge);

        _app.Time.Advance(TimeSpan.FromDays(1));

        Assert.False((await GetAsync(1))[1].InTodayChallenge);
    }

    [Theory]
    [InlineData(-29, true)]
    [InlineData(-30, true)] // limite : la v1 exclut encore un morceau tiré il y a 30 jours (LastUsedDate < jour - cooldown)
    [InlineData(-31, false)]
    [InlineData(-90, false)]
    public async Task Cooldown_MorceauTireIlYAXJours_EstExcluOuNon(int daysAgo, bool excluded)
    {
        await _app.AddChallengeAsync(Today.AddDays(daysAgo), 1);

        var inCooldown = await InCooldownAsync(Today);

        Assert.Equal(excluded, inCooldown.Contains(1));
    }

    [Fact]
    public async Task Cooldown_PourDemain_LeDefiDuJourEstExclu_CeQueLeControleDeNuitDemande()
    {
        await _app.AddChallengeAsync(Today, 1, 2);
        await _app.AddChallengeAsync(Today.AddDays(-31), 3);

        var inCooldown = await InCooldownAsync(Today.AddDays(1));

        Assert.Equal([1, 2], inCooldown.Order());
        // Dans 31 jours (la date de déblocage du pool), les morceaux du défi d'aujourd'hui sont tirables : 1 et 2 sortent.
        Assert.Empty(await InCooldownAsync(Today.AddDays(31)));
    }

    [Fact]
    public async Task PoolAdmin_AfficheLUsageCalculeSurLesDefis()
    {
        await _app.AddChallengeAsync(Today.AddDays(-2), 1);
        await _app.AddChallengeAsync(Today, 2);

        var list = (await _app.Admin().GetFromJsonAsync<List<TrackListItem>>("/api/admin/catalogue/tracks", Ct))!;

        var first = list.Single(t => t.Id == 1);
        Assert.Equal((Today.AddDays(-2), 1, Today.AddDays(29), false), (first.LastUsedDate!.Value, first.UsageCount, first.UnlockDate!.Value, first.InTodayChallenge));
        Assert.True(list.Single(t => t.Id == 2).InTodayChallenge);
        Assert.Equal(0, list.Single(t => t.Id == 3).UsageCount);
    }

    private async Task<IReadOnlyDictionary<int, TrackUsage>> GetAsync(params int[] ids)
    {
        using var scope = _app.Api.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ITrackUsage>().GetAsync(ids, Ct);
    }

    private async Task<IReadOnlySet<int>> InCooldownAsync(DateOnly day)
    {
        using var scope = _app.Api.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IDailyTrackUsage>().GetTracksInCooldownAsync(day, Ct);
    }
}
