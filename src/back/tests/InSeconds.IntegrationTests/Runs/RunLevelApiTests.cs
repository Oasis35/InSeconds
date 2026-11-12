using System.Net;
using System.Text.Json;
using InSeconds.Api.Modules.Runs.Application;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Le niveau du joueur par HTTP : la fin d'une partie gagnée ou perdue met à jour la moyenne glissante (table <c>runs.player_levels</c>), l'écran de fin
/// dit le gain, l'accueil (<c>GET /api/runs/me</c>) le disque et la progression ; une partie abandonnée ne compte pas ; un réglage relu à chaud change l'échelle.
/// </summary>
public class RunLevelApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    private static readonly bool[] AllFound = [true, true, true, true, true];
    private static readonly bool[] NoneFound = [false, false, false, false, false];

    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    /// <summary>Un run perdu à la deuxième manche, après une première manche entièrement trouvée : 500 points.</summary>
    private static async Task<RunPlayResponse> PlayLostAfterOneRoundAsync(RunGamer player)
    {
        var run = (await player.LaunchAsync()).Session;
        await player.PlayAsync(run.SessionId, run.ChallengeCode, 1, AllFound);
        return await player.PlayAsync(run.SessionId, run.ChallengeCode, 6, NoneFound);
    }

    /// <summary>Un run perdu d'entrée : 0 point.</summary>
    private static async Task<RunPlayResponse> PlayLostAtOnceAsync(RunGamer player)
    {
        var run = (await player.LaunchAsync()).Session;
        return await player.PlayAsync(run.SessionId, run.ChallengeCode, 1, NoneFound);
    }

    [Fact]
    public async Task AvantLaPremierePartie_PasDeNiveau_NiLigneEnBase()
    {
        var alice = await _run.NewInvitedAsync("Alice");

        Assert.Null((await alice.MeAsync()).Level);
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM runs.player_levels"));
    }

    [Fact]
    public async Task LaFinDUnePartie_MetLeNiveauAJour_LEcranDeFinDitLeGain_ProvisoireAvantTroisParties()
    {
        var alice = await _run.NewInvitedAsync("Alice");

        var end = await PlayLostAfterOneRoundAsync(alice);

        var finish = end.Session.Finish!;
        Assert.Equal(500, finish.TotalScore);
        var level = finish.Level!;
        Assert.Equal((500, 1, true, 500), (level.Points, level.RunsPlayed, level.Provisional, level.Delta));
        Assert.Equal(new RunDiscResponse("runs.discs.wax", 0), level.Disc);
        Assert.Equal(new RunDiscResponse("runs.discs.bronze", 0), level.NextDisc);
        Assert.Equal((200, 50), (level.PointsToNext, level.ProgressPercent));
        Assert.Equal(1L, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM runs.player_levels"));
        Assert.Equal("{500}", await _run.Api.ScalarAsync<string>("SELECT recent_scores::text FROM runs.player_levels"));
    }

    [Fact]
    public async Task UnMauvaisRun_FaitBaisserLeNiveau_EtLAccueilLeMontreSansGain()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        await PlayLostAfterOneRoundAsync(alice);

        var end = await PlayLostAtOnceAsync(alice);

        Assert.Equal((250, -250), (end.Session.Finish!.Level!.Points, end.Session.Finish.Level.Delta));
        var me = (await alice.MeAsync()).Level!;
        Assert.Equal((250, 2, null), (me.Points, me.RunsPlayed, me.Delta));
        Assert.Equal("runs.discs.scratched", me.Disc.Key);
        Assert.Equal((50, 83), (me.PointsToNext, me.ProgressPercent));
    }

    [Fact]
    public async Task LeNiveau_NEstPlusProvisoire_ApresTroisParties()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        foreach (var _ in Enumerable.Range(0, 3))
            await PlayLostAfterOneRoundAsync(alice);

        var level = (await alice.MeAsync()).Level!;

        Assert.Equal((500, 3, false), (level.Points, level.RunsPlayed, level.Provisional));
    }

    [Fact]
    public async Task UneRelectureDeLaPartieFinie_GardeLeGain_QuandCEstLaDerniere()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var end = await PlayLostAfterOneRoundAsync(alice);

        var again = await alice.SessionAsync(end.Session.SessionId);

        Assert.Equal(500, again.Finish!.Level!.Delta);
    }

    [Fact]
    public async Task UnePartieAbandonnee_NeCompteJamais()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var run = (await alice.LaunchAsync()).Session;
        await alice.PlayAsync(run.SessionId, run.ChallengeCode, 1, AllFound);

        Assert.Equal(HttpStatusCode.NoContent, (await alice.AbandonRawAsync(run.SessionId)).StatusCode);

        Assert.Null((await alice.MeAsync()).Level);
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM runs.player_levels"));
    }

    [Fact]
    public async Task LeNiveau_EstPropreACeJoueur()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var bob = await _run.NewInvitedAsync("Bob");
        await PlayLostAfterOneRoundAsync(alice);

        Assert.Null((await bob.MeAsync()).Level);
    }

    [Fact]
    public async Task LEchelle_EstRelueAChaud()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        await PlayLostAfterOneRoundAsync(alice);
        Assert.Equal("runs.discs.wax", (await alice.MeAsync()).Level!.Disc.Key);

        await _run.Game.SetSettingAsync(
            "Runs:Levels:Discs", """[{"disc":"runs.discs.scratched","points":0},{"disc":"runs.discs.gold","points":400}]""");

        var level = (await alice.MeAsync()).Level!;
        Assert.Equal(new RunDiscResponse("runs.discs.gold", 0), level.Disc);
        Assert.Null(level.NextDisc);
        Assert.Equal(100, level.ProgressPercent);
    }

    [Fact]
    public async Task ReponseDeFin_NeContientRienQuiIdentifieUnMorceauAVenir()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var end = await PlayLostAfterOneRoundAsync(alice);

        var json = JsonSerializer.Serialize(end.Session.Finish!.Level, JsonSerializerOptions.Web);

        Assert.DoesNotContain("deezer", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("artist", json, StringComparison.OrdinalIgnoreCase);
    }
}
