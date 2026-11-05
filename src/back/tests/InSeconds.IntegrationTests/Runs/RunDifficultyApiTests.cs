using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;
using InSeconds.IntegrationTests.Players;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Le proto 2 par HTTP : le choix de la difficulté d'une manche (<c>POST …/difficulty</c>), ce que l'état de la partie en dit, les points et
/// l'objectif qui suivent la difficulté, la manche boss, la réserve du Joker tirée avec la playlist, et une playlist du proto 1 qui se joue comme avant.
/// </summary>
public class RunDifficultyApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly bool[] AllFound = [true, true, true, true, true];

    private RunGame _run = null!;

    // 28 morceaux : des tranches de 7, donc 5 morceaux et 2 de réserve par manche.
    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 28);

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private async Task<(RunGamer Alice, int Id, string Code)> InRoundTwoAsync()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        Assert.Null(start.DifficultyChoice);
        await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, AllFound);
        return (alice, start.SessionId, start.ChallengeCode);
    }

    [Fact]
    public async Task ApresLaManche1_LEtatProposeLesTroisDifficultes_EtLExtraitEstDejaLa()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;

        var end = await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, AllFound);

        Assert.Equal(2, end.Session.DifficultyChoice!.Round);
        Assert.Equal(
            [new("easy", 219, 445, 10m), new("safe", 366, 665, 10m), new RunDifficultyOptionResponse("risky", 552, 885, 10m)],
            end.Session.DifficultyChoice.Options);
        Assert.Equal(new RunRoundResponse(2, 0, 366, 665, "safe"), end.Session.Round);
        // Le toucher d'une colonne lance l'extrait sans aller-retour : il arrive avec la dernière réponse de la manche.
        Assert.NotNull(end.Current!.PreviewUrl);
        Assert.Equal((6, 10m), (end.Current.Position, end.Current.ListenSeconds));
        Assert.Equivalent(end.Session, await alice.SessionAsync(start.SessionId));
    }

    [Fact]
    public async Task Choisir_Risquee_PointsEtObjectifALaDifficulte_PuisPlusDeChoix()
    {
        var (alice, id, code) = await InRoundTwoAsync();

        var chosen = await alice.ChooseAsync(id, 2, "risky");

        Assert.Equal(new RunRoundResponse(2, 0, 552, 885, "risky"), chosen.Round);
        Assert.Null(chosen.DifficultyChoice);
        Assert.Equal(3, await _run.Api.ScalarAsync<short>($"SELECT difficulty FROM runs.session_rounds WHERE session_id = {id} AND round = 2"));

        var answer = await alice.AnswerAsync(id, code, 6);
        Assert.Equal(177, answer.Revealed!.Points);
        Assert.Equal(new RunRoundResponse(2, 177, 552, 885, "risky"), answer.Session.Round);

        // 3 morceaux trouvés : 531, sous l'objectif choisi ; Sûre l'aurait passée, la partie est perdue.
        var last = await alice.PlayAsync(id, code, 7, true, true, false, false);
        Assert.Equal("lost", last.Session.Status);
        Assert.Equal(new RunRoundScoreResponse(2, 531, 552, false, "risky"), last.Session.Finish!.Rounds[1]);
    }

    [Fact]
    public async Task LeChoix_Refuse_HorsDeLaMancheEnCours_DejaFait_OuApresLePremierSon()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        // La première manche n'a pas de choix.
        await GameAsserts.ProblemAsync(await alice.ChooseRawAsync(id, 1, "safe"), HttpStatusCode.Conflict, RunsErrorCodes.DifficultyLocked);
        await alice.PlayAsync(id, code, 1, AllFound);
        await GameAsserts.ProblemAsync(await alice.ChooseRawAsync(id, 3, "safe"), HttpStatusCode.Conflict, RunsErrorCodes.DifficultyLocked);
        await GameAsserts.ProblemAsync(await alice.ChooseRawAsync(id, 2, "hard"), HttpStatusCode.BadRequest, "common.bad_request");

        // Le premier son de la manche ferme le choix.
        Assert.Equal(HttpStatusCode.NoContent, (await alice.ListenRawAsync(id, 6, 2m)).StatusCode);
        await GameAsserts.ProblemAsync(await alice.ChooseRawAsync(id, 2, "risky"), HttpStatusCode.Conflict, RunsErrorCodes.DifficultyLocked);
        Assert.Null((await alice.SessionAsync(id)).DifficultyChoice);

        // La partie d'un autre joueur reste une partie inconnue.
        var bob = await _run.NewPlayerAsync("Bob");
        await GameAsserts.ProblemAsync(await bob.ChooseRawAsync(id, 2, "safe"), HttpStatusCode.NotFound, RunsErrorCodes.SessionNotFound);
    }

    [Fact]
    public async Task UnChoixDejaFait_NeSeRefaitPas()
    {
        var (alice, id, _) = await InRoundTwoAsync();

        await alice.ChooseAsync(id, 2, "easy");

        await GameAsserts.ProblemAsync(await alice.ChooseRawAsync(id, 2, "risky"), HttpStatusCode.Conflict, RunsErrorCodes.DifficultyLocked);
        Assert.Equal("easy", (await alice.SessionAsync(id)).Round!.Difficulty);
    }

    [Fact]
    public async Task SansChoix_LaMancheSeJoueEnSure_CommeAuProto1()
    {
        var (alice, id, code) = await InRoundTwoAsync();

        var answer = await alice.AnswerAsync(id, code, 6);

        Assert.Equal(133, answer.Revealed!.Points);
        Assert.Equal("safe", answer.Session.Round!.Difficulty);
        Assert.Equal(2, await _run.Api.ScalarAsync<short>($"SELECT difficulty FROM runs.session_rounds WHERE session_id = {id} AND round = 2"));
    }

    [Fact]
    public async Task LaMancheBoss_EcouteDeCinqSecondes_EtPasPlus()
    {
        var (alice, id, code) = await InRoundTwoAsync();
        await alice.PlayAsync(id, code, 6, AllFound);
        var end = await alice.PlayAsync(id, code, 11, AllFound);
        Assert.Equal(5m, end.Session.DifficultyChoice!.Options.Single(o => o.Difficulty == "risky").ListenSeconds);

        await alice.ChooseAsync(id, 4, "risky");

        await GameAsserts.ProblemAsync(await alice.ListenRawAsync(id, 16, 6m), HttpStatusCode.BadRequest, "common.bad_request");
        Assert.Equal(HttpStatusCode.NoContent, (await alice.ListenRawAsync(id, 16, 5m)).StatusCode);
        var preview = await alice.PreviewAsync(id);
        Assert.Equal((16, 5m), (preview.Current!.Position, preview.Current.ListenSeconds));
    }

    [Fact]
    public async Task LaReserve_TireeAvecLaPlaylist_MorceauxProtegesDansLePool()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var code = (await alice.LaunchAsync()).Session.ChallengeCode;

        var reserve = await _run.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM runs.challenge_reserve_tracks r JOIN runs.challenges c ON c.id = r.challenge_id WHERE c.code = '{code}'");
        Assert.Equal(8L, reserve);
        var reserveTrack = await _run.Api.ScalarAsync<int>(
            $"SELECT r.track_id FROM runs.challenge_reserve_tracks r JOIN runs.challenges c ON c.id = r.challenge_id WHERE c.code = '{code}' LIMIT 1");

        using var scope = _run.Api.Services.CreateScope();
        var usage = await scope.ServiceProvider.GetRequiredService<ITrackPoolUsage>().GetAsync([reserveTrack], Ct);
        Assert.True(usage[reserveTrack].IsUsed);
    }

    [Fact]
    public async Task UnePlaylistDuProto1_SeJoueSansChoix_ASesAnciensSeuils()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);
        await _run.Api.ExecuteAsync($$"""
            UPDATE runs.challenges SET rules = '{"rounds":4,"tracksPerRound":5,"listenSeconds":10,"thresholdPercents":[40,50,60,70],"minMultiplier":1,"maxMultiplier":2,"answerSeconds":45}'
            WHERE code = '{{code}}'
            """);

        Assert.Equal(new RunRoundResponse(1, 0, 200, 500, "safe"), (await alice.SessionAsync(id)).Round);
        var end = await alice.PlayAsync(id, code, 1, AllFound);
        Assert.Null(end.Session.DifficultyChoice);
        Assert.Equal(new RunRoundResponse(2, 0, 333, 665, "safe"), end.Session.Round);
        await GameAsserts.ProblemAsync(await alice.ChooseRawAsync(id, 2, "risky"), HttpStatusCode.Conflict, RunsErrorCodes.DifficultyLocked);
        await alice.AnswerAsync(id, code, 6);
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.session_rounds WHERE session_id = {id}"));
    }

    [Fact]
    public async Task LaCopieDesDonnees_DonneLaDifficulteDeChaqueManche()
    {
        var (alice, id, _) = await InRoundTwoAsync();
        await alice.ChooseAsync(id, 2, "risky");

        var export = (await alice.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        var game = Assert.Single(ExportReading.Section<RunsDataExport>(export, "runs").Games);
        Assert.Equal([(2, "risky")], game.Rounds.Select(r => (r.Round, r.Difficulty)));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
