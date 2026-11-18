using System.Net;
using System.Text.Json;
using InSeconds.Api.Modules.Runs.Application;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Le niveau du joueur par HTTP : la fin d'une série met à jour le niveau (80 % de l'ancien, 20 % du score, table <c>runs.player_levels</c>), l'écran de
/// fin dit le gain, l'accueil (<c>GET /api/runs/me</c>) le disque, la progression et l'inactivité ; une partie abandonnée ne compte pas ; un réglage relu
/// à chaud change l'échelle.
/// </summary>
public class RunLevelApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    private static readonly bool[] AllFound = [true, true, true, true, true];
    private static readonly bool[] NoneFound = [false, false, false];

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
    public async Task LaFinDUneSerie_MetLeNiveauAJour_LEcranDeFinDitLeGain_SansDisqueSous300()
    {
        var alice = await _run.NewInvitedAsync("Alice");

        var end = await PlayLostAfterOneRoundAsync(alice);

        var finish = end.Session.Finish!;
        Assert.Equal(500, finish.TotalScore);
        var level = finish.Level!;
        // 20 % de 500 : 100 points, sous le disque rayé.
        Assert.Equal((100, 1, 100, "same"), (level.Points, level.RunsPlayed, level.Delta, level.DiscChange));
        Assert.Null(level.Disc);
        Assert.Equal(new RunDiscResponse("runs.discs.scratched", 0), level.NextDisc);
        Assert.Equal((200, 33), (level.PointsToNext, level.ProgressPercent));
        Assert.Equal((0, null), (level.InactivityLoss, level.DiscDropInDays));
        Assert.Equal(100, await _run.Api.ScalarAsync<int>("SELECT points FROM runs.player_levels"));
    }

    [Fact]
    public async Task UnMauvaisRun_FaitBaisserLeNiveauDe10PourCentAuPlus_EtLAccueilLeMontreSansGain()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        await PlayLostAfterOneRoundAsync(alice);

        var end = await PlayLostAtOnceAsync(alice);

        Assert.Equal((90, -10), (end.Session.Finish!.Level!.Points, end.Session.Finish.Level.Delta));
        var me = (await alice.MeAsync()).Level!;
        Assert.Equal((90, 2, null, null), (me.Points, me.RunsPlayed, me.Delta, me.DiscChange));
        Assert.Null(me.Disc);
        Assert.Equal((210, 30), (me.PointsToNext, me.ProgressPercent));
    }

    [Fact]
    public async Task LeDisqueGagne_EstAnnonce_PuisLInactiviteLeMenaceALaLecture()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        await PlayLostAfterOneRoundAsync(alice);
        await _run.Api.ExecuteAsync($"UPDATE runs.player_levels SET points = 1000 WHERE player_id = '{alice.Id}'");

        var end = await PlayLostAfterOneRoundAsync(alice);

        // 80 % de 1 000 + 20 % de 500 = 900 : le bronze.
        var level = end.Session.Finish!.Level!;
        Assert.Equal((900, "runs.discs.bronze", "same", 14), (level.Points, level.Disc!.Key, level.DiscChange, level.DiscDropInDays));

        _run.Game.Time.Advance(TimeSpan.FromDays(15));
        var me = (await alice.MeAsync()).Level!;
        // La grâce de 14 jours est passée : -5 %, 855, le bronze est perdu ; le niveau stocké, lui, ne bouge pas.
        Assert.Equal((855, 45), (me.Points, me.InactivityLoss));
        Assert.Equal("runs.discs.scratched", me.Disc!.Key);
        Assert.Equal(900, await _run.Api.ScalarAsync<int>($"SELECT points FROM runs.player_levels WHERE player_id = '{alice.Id}'"));
    }

    [Fact]
    public async Task UneRelectureDeLaPartieFinie_GardeLeGain_QuandCEstLaDerniere()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var end = await PlayLostAfterOneRoundAsync(alice);

        var again = await alice.SessionAsync(end.Session.SessionId);

        Assert.Equal(100, again.Finish!.Level!.Delta);
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
        Assert.Null((await alice.MeAsync()).Level!.Disc);

        await _run.Game.SetSettingAsync(
            "Runs:Levels:Discs", """[{"disc":"runs.discs.scratched","points":50},{"disc":"runs.discs.gold","points":100}]""");

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
