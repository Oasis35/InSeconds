using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.IntegrationTests.Daily;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// L'usage des morceaux déclaré par Runs (<c>ITrackUsage</c>, mode <c>runs</c>) : un morceau d'un défi n'est plus supprimable ni actualisable, le
/// pool l'affiche comme utilisé par le mode « runs », et ni les dates ni le cooldown du Daily n'en sont touchés.
/// </summary>
public class RunsTrackUsageTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Tracks = "/api/admin/catalogue/tracks";

    private GameApi _game = null!;
    private HttpClient _admin = null!;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 10);
        _admin = _game.Api.CreateClient(TestUser.Admin);
        // Un défi de run dont deux des morceaux sont 1 et 2 (les autres lignes seraient sans objet pour ces tests).
        await _game.Api.ExecuteAsync("""
            INSERT INTO runs.challenges (id, code, seed, rules, created_at) VALUES (1, 'K7Q2M9', 1, '{}', now());
            INSERT INTO runs.challenge_tracks (challenge_id, position, track_id, round, multiplier) VALUES (1, 1, 1, 1, 1.00), (1, 2, 2, 1, 1.00);
            """);
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    [Fact]
    public async Task UnMorceauDUnDefiDeRun_EstUtilise_SansDatesNiCooldown()
    {
        using var scope = _game.Api.Services.CreateScope();

        var usage = await scope.ServiceProvider.GetRequiredService<ITrackPoolUsage>().GetAsync([1, 2, 3], Ct);

        Assert.True(usage[1].IsUsed);
        Assert.Equal((0, null, null, false), (usage[1].UsageCount, usage[1].LastUsedDate, usage[1].UnlockDate, usage[1].InTodayChallenge));
        Assert.False(usage.ContainsKey(3));
        var byMode = await scope.ServiceProvider.GetRequiredService<ITrackPoolUsage>().GetByModeAsync([1], Ct);
        Assert.Equal(["runs"], byMode[1].Select(m => m.Mode));
    }

    [Fact]
    public async Task LePool_MontreLeMorceauUtilise_ParLeModeRuns()
    {
        var list = (await _admin.GetFromJsonAsync<List<TrackListItem>>(Tracks, Ct))!;

        var used = list.Single(t => t.Id == 1);
        Assert.True(used.IsUsed);
        Assert.Equal(new TrackModeUsage("runs", 0, null, null, false), Assert.Single(used.Usages));
        Assert.False(list.Single(t => t.Id == 3).IsUsed);
    }

    [Fact]
    public async Task UnMorceauJoueAuDailyEtEnRun_AUnePastillePourChaqueMode_LesDatesRestentCellesDuDaily()
    {
        await _game.App.AddChallengeAsync(DailyApi.Today.AddDays(-2), 1);

        var track = (await _admin.GetFromJsonAsync<List<TrackListItem>>(Tracks, Ct))!.Single(t => t.Id == 1);

        Assert.Equal(["daily", "runs"], track.Usages.Select(u => u.Mode).Order(StringComparer.Ordinal));
        Assert.Equal((1, DailyApi.Today.AddDays(-2)), (track.Daily().UsageCount, track.Daily().LastUsedDate!.Value));
        Assert.Equal(0, track.UsageOf("runs").UsageCount);
    }

    [Fact]
    public async Task SupprimerUnMorceauDUnDefiDeRun_409()
    {
        var response = await _admin.DeleteAsync($"{Tracks}/1", Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("catalogue.track_in_use", (await response.Content.ReadFromJsonAsync<ProblemDetails>(Ct))!.Extensions["code"]?.ToString());
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM catalogue.tracks WHERE id = 1"));
        // Un morceau qu'aucun mode n'a joué reste supprimable.
        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync($"{Tracks}/3", Ct)).StatusCode);
    }

    [Fact]
    public async Task ActualiserUnMorceauDUnDefiDeRun_409()
    {
        var response = await _admin.PutAsJsonAsync($"{Tracks}/1", new UpdateTrack(123456), Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("catalogue.track_in_use", (await response.Content.ReadFromJsonAsync<ProblemDetails>(Ct))!.Extensions["code"]?.ToString());
    }

    [Fact]
    public async Task DesactiverUnMorceauDUnDefiDeRun_EstPermis_LeDefiLeGarde()
    {
        var response = await _admin.PutAsJsonAsync($"{Tracks}/1/disabled", new SetTrackDisabled(true), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM runs.challenge_tracks WHERE track_id = 1"));
    }

    [Fact]
    public async Task LeCooldownDuDaily_NeCompteJamaisLesMorceauxDesRuns()
    {
        using var scope = _game.Api.Services.CreateScope();

        var inCooldown = await scope.ServiceProvider.GetRequiredService<InSeconds.Api.Modules.Daily.Application.IDailyTrackUsage>()
            .GetTracksInCooldownAsync(DailyApi.Today, Ct);

        Assert.Empty(inCooldown);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
