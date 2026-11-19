using Microsoft.Extensions.DependencyInjection;
using System.Net;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Les règles de la Série d'aujourd'hui par HTTP : manches de 3, une vie regagnée par manche sans vie perdue, l'écoute qui raccourcit dès qu'une manche
/// se termine sans vie perdue, plafond de 8 manches (« Série complète ») et bonus, figés dans la playlist à sa création.
/// </summary>
public class RunSeriesRulesTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() =>
        _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), settings: new Dictionary<string, string>(RunGame.SeriesRules));

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    [Fact]
    public async Task LesReglesDAujourdhui_SontFigeesDansLaPlaylist_EtLesAnciennesGardentLeurs()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;

        Assert.Equal((3, 8), (start.TracksPerRound, start.MaxRounds));
        // Le lien d'un ami annonce le même plafond (« Jusqu'à 8 manches »).
        Assert.Equal(8, (await alice.ChallengeAsync(start.ChallengeCode)).MaxRounds);
        Assert.Equal(8, await _run.Api.ScalarAsync<int>($"SELECT (rules->>'maxRounds')::int FROM runs.challenges WHERE code = '{start.ChallengeCode}'"));
        Assert.True(await _run.Api.ScalarAsync<bool>($"SELECT (rules->>'regainLife')::boolean FROM runs.challenges WHERE code = '{start.ChallengeCode}'"));

        // Une playlist d'avant (rien de ces champs dans ses règles figées) : ni vie regagnée, ni plafond, ni bonus, quels que soient les réglages d'aujourd'hui.
        await _run.Api.ExecuteAsync(
            "UPDATE runs.challenges SET rules = rules - 'regainLife' - 'maxRounds' - 'lifeBonus' - 'completeBonus' - 'shortenOnNoLifeLost' - 'holdOnLifeLost'"
            + $" WHERE code = '{start.ChallengeCode}'");
        var resumed = await alice.SessionAsync(start.SessionId);
        Assert.Equal(0, resumed.MaxRounds);
        Assert.Equal(0, (await alice.ChallengeAsync(start.ChallengeCode)).MaxRounds);
    }

    [Fact]
    public async Task UneMancheSansVieRetiree_RendUneVie_PasLaPremiereSiAucuneNEstPerdue()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        var first = await alice.PlayAsync(id, code, 1, false, true, true);
        var summary = Assert.Single(first.RoundSummaries);
        Assert.Equal((2, false, "same"), (summary.LivesLeft, summary.LifeRegained, summary.Outcome));

        var second = await alice.PlayAsync(id, code, 4, true, true, true);
        summary = Assert.Single(second.RoundSummaries);
        Assert.Equal((3, true, "shorter"), (summary.LivesLeft, summary.LifeRegained, summary.Outcome));
        Assert.Equal(3, second.Session.LivesLeft);

        // Au maximum de vies : la manche suivante, propre, n'en rend pas.
        var third = await alice.PlayAsync(id, code, 7, true, true, true);
        summary = Assert.Single(third.RoundSummaries);
        Assert.Equal((3, false), (summary.LivesLeft, summary.LifeRegained));
    }

    [Fact]
    public async Task UneVieRetiree_LaisseLEcouteAuPalierAtteint()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        await alice.PlayAsync(id, code, 1, true, true, true);
        var second = await alice.PlayAsync(id, code, 4, true, false, true);

        var summary = Assert.Single(second.RoundSummaries);
        Assert.Equal(("same", 5m, 5m), (summary.Outcome, summary.ListenSeconds, summary.NextListenSeconds));
    }

    [Fact]
    public async Task UnePlaylistSansLaRegleDuPalier_RallongueEncoreApresUneVieRetiree()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);
        await _run.Api.ExecuteAsync($"UPDATE runs.challenges SET rules = rules - 'holdOnLifeLost' WHERE code = '{code}'");

        await alice.PlayAsync(id, code, 1, true, true, true);
        var second = await alice.PlayAsync(id, code, 4, true, false, true);

        var summary = Assert.Single(second.RoundSummaries);
        Assert.Equal(("longer", 5m, 10m), (summary.Outcome, summary.ListenSeconds, summary.NextListenSeconds));
    }

    [Fact]
    public async Task UneMoitieJuste_NeGenePasLaDescenteDeLEcoute()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        await alice.AnswerAsync(id, code, 1);
        await alice.AnswerAsync(id, code, 2, artist: true, title: false);
        var end = await alice.AnswerAsync(id, code, 3);

        var summary = Assert.Single(end.RoundSummaries);
        Assert.Equal(("shorter", 10m, 5m), (summary.Outcome, summary.ListenSeconds, summary.NextListenSeconds));
        Assert.Equal(3, end.Session.LivesLeft);
    }

    [Fact]
    public async Task HuitManchesJouees_SerieComplete_ScoreBonusRecordEtNiveau()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        // Une vie perdue d'entrée, rendue à la manche 2 : 3 vies à la fin.
        await alice.PlayAsync(id, code, 1, false, true, true);
        RunPlayResponse last = null!;
        for (var round = 2; round <= 8; round++)
        {
            last = await alice.PlayAsync(id, code, ((round - 1) * 3) + 1, true, true, true);
            if (round < 8)
                Assert.Equal("pending", last.Session.Status);
        }

        Assert.Null(last.Current);
        Assert.Null(last.Session.Round);
        var finish = last.Session.Finish!;
        Assert.Equal(("completed", 8, 3, 250 * 3, 500), (finish.Status, finish.RoundsPassed, finish.LivesLeft, finish.LifeBonus, finish.CompleteBonus));
        // Les points des morceaux, plus les bonus (3 vies à 250, et la Série complète à 500).
        var played = last.Session.PlayedTracks.Sum(t => t.Points);
        Assert.Equal(played + 750 + 500, finish.TotalScore);
        Assert.Equal(finish.TotalScore, await _run.Api.ScalarAsync<int>($"SELECT total_score FROM runs.sessions WHERE id = {id}"));
        Assert.Equal(1, await _run.Api.ScalarAsync<short>($"SELECT status FROM runs.sessions WHERE id = {id}"));
        Assert.Equal(finish.TotalScore, await _run.Api.ScalarAsync<int>($"SELECT best_score FROM runs.records WHERE player_id = '{alice.Id}'"));
        Assert.Equal(1, await _run.Api.ScalarAsync<int>($"SELECT runs_played FROM runs.player_levels WHERE player_id = '{alice.Id}'"));

        // Terminée : plus de réponse, plus de reprise, la partie sort de « en cours », et la comparaison s'ouvre.
        await GameAsserts.ProblemAsync(await alice.AnswerRawAsync(id, 25, "a", "b"), HttpStatusCode.Conflict, RunsErrorCodes.AlreadyPlayed);
        await GameAsserts.ProblemAsync(await alice.JoinRawAsync(code), HttpStatusCode.Conflict, RunsErrorCodes.AlreadyPlayed);
        Assert.Null((await alice.MeAsync()).Pending);
        var comparison = await alice.ComparisonAsync(code);
        Assert.Equal(finish.TotalScore, Assert.Single(comparison.Rows).TotalScore);
    }

    [Fact]
    public async Task UneSerieComplete_AvecUneSeuleVie_RapporteLeBonusDUneVie()
    {
        using var sessions = new Microsoft.Extensions.Diagnostics.Metrics.Testing.MetricCollector<long>(
            _run.Api.Services.GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>(), RunsMetrics.MeterName, RunsMetrics.SessionsName);
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        for (var round = 1; round <= 7; round++)
            await alice.PlayAsync(id, code, ((round - 1) * 3) + 1, true, true, true);
        // Dernière manche : deux vies perdues, il en reste une, la Série est complète.
        var last = await alice.PlayAsync(id, code, 22, true, false, false);

        var finish = last.Session.Finish!;
        Assert.Equal(("completed", 1, 250, 500), (finish.Status, finish.LivesLeft, finish.LifeBonus, finish.CompleteBonus));
        // Le compteur de parties dit « completed » (jamais « lost »), avec la dernière manche.
        var ended = sessions.GetMeasurementSnapshot().Single(m => Convert.ToString(m.Tags["event"], System.Globalization.CultureInfo.InvariantCulture) == RunsMetrics.Completed);
        Assert.Equal(8, Convert.ToInt32(ended.Tags["round"], System.Globalization.CultureInfo.InvariantCulture));
    }

    [Fact]
    public async Task LesPartiesDAvant_NeFinissentJamaisEnSerieComplete()
    {
        await using var legacy = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());
        var alice = await legacy.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;

        Assert.Equal((5, 0), (start.TracksPerRound, start.MaxRounds));
        var after = await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, [.. Enumerable.Repeat(true, 35)]);
        Assert.Equal("pending", after.Session.Status);
        Assert.Equal(7, after.Session.RoundsPassed);
    }
}
