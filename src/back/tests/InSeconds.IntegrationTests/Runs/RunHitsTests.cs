using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Runs.Application;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>Les Hits du mode Run (<c>GET /api/runs/hits</c>, proto 4) : calculés à la lecture sur les parties finies du joueur de la requête.</summary>
public class RunHitsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private static readonly bool[] AllFound = [true, true, true, true, true];
    private static readonly bool[] NoneFound = [false, false, false, false, false];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<RunHitsResponse> HitsAsync(RunGamer gamer) =>
        (await gamer.Client.GetFromJsonAsync<RunHitsResponse>("/api/runs/hits", Ct))!;

    private static string[] Earned(RunHitsResponse hits) => [.. hits.Hits.Where(h => h.Earned).Select(h => h.Key)];

    [Fact]
    public async Task SansPartie_SeizeHits_AucunObtenu_EtUnAbandonNeComptePas()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var launched = await alice.LaunchAsync();
        await alice.AbandonRawAsync(launched.Session.SessionId);

        var hits = await HitsAsync(alice);

        Assert.Equal(16, hits.Hits.Count);
        Assert.Equal(0, hits.EarnedCount);
        Assert.Empty(Earned(hits));
    }

    [Fact]
    public async Task UneSetlistGagnee_DonneSesHits_PuisUnRecordBattu()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var lost = await alice.LaunchAsync();
        await alice.PlayAsync(lost.Session.SessionId, lost.Session.ChallengeCode, 1, [.. AllFound, .. NoneFound]);
        Assert.Equal(["first_setlist", "first_card", "perfect_round"], Earned(await HitsAsync(alice)));

        var won = await alice.LaunchAsync();
        await alice.PlayAsync(won.Session.SessionId, won.Session.ChallengeCode, 1, [.. AllFound, .. AllFound, .. AllFound, .. AllFound]);

        var hits = await HitsAsync(alice);
        Assert.Contains("first_record", Earned(hits));
        Assert.Contains("ten_in_a_row", Earned(hits));
        Assert.Contains("setlist_won", Earned(hits));
        Assert.DoesNotContain("boss_beaten", Earned(hits));
        Assert.Equal(hits.Hits.Count(h => h.Earned), hits.EarnedCount);
        var ten = hits.Hits.Single(h => h.Key == "ten_setlists");
        Assert.Equal((2, 10), (ten.Progress, ten.Target));
    }

    [Fact]
    public async Task UnAmiJoueMaSetlist_LeDuelEstAuGagnant_ChacunNeVoitQueLesSiens()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var bob = await _run.NewPlayerAsync("Bob");
        var launched = await alice.LaunchAsync();
        var code = launched.Session.ChallengeCode;
        await alice.PlayAsync(launched.Session.SessionId, code, 1, [.. AllFound, .. NoneFound]);
        Assert.DoesNotContain("friend_played", Earned(await HitsAsync(alice)));

        var joined = await bob.JoinAsync(code);
        await bob.PlayAsync(joined.Session.SessionId, code, 1, [.. AllFound, .. AllFound, .. NoneFound]);

        var hers = Earned(await HitsAsync(alice));
        Assert.Contains("friend_played", hers);
        Assert.DoesNotContain("duel_won", hers);
        var his = await HitsAsync(bob);
        Assert.Contains("duel_won", Earned(his));
        Assert.DoesNotContain("friend_played", Earned(his));
        Assert.Equal(1, his.Hits.Single(h => h.Key == "five_duels").Progress);
    }

    [Fact]
    public async Task SansIdentite_401()
    {
        using var client = _run.Api.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/runs/hits", Ct)).StatusCode);
    }
}
