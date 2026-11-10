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
/// l'objectif qui suivent la difficulté, la manche boss, la réserve de l'Échange tirée avec la playlist, et une playlist du proto 1 qui se joue comme avant.
/// </summary>
public class RunDifficultyApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly bool[] AllFound = [true, true, true, true, true];

    private readonly CapturingLoggerProvider _logs = new();
    private RunGame _run = null!;

    // 28 morceaux : des tranches de 7, donc 5 morceaux et 2 de réserve par manche.
    public async ValueTask InitializeAsync() =>
        _run = await RunGame.CreateAsync(
            await postgres.CreateDatabaseAsync(), tracks: 28, configureServices: s => s.AddSingleton<Microsoft.Extensions.Logging.ILoggerProvider>(_logs));

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
        // Sans la Prolongation (la carte gagnée à la manche 1 ajouterait 5 s d'écoute) : l'écoute reste celle des règles.
        await _run.Game.SetSettingAsync("Runs:Cards", "[\"hint\"]");
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;

        var end = await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, AllFound);

        Assert.Equal(2, end.Session.DifficultyChoice!.Round);
        Assert.Equal(
            [new("easy", 219, 445, 10m), new("safe", 366, 665, 10m), new RunDifficultyOptionResponse("risky", 552, 885, 10m)],
            end.Session.DifficultyChoice.Options);
        Assert.Equal(new RunRoundResponse(2, 0, 366, 665, "safe"), end.Session.Round);
        // Rien du premier morceau de la manche 2 ne part avant le choix : on ne mise pas en connaissant le morceau.
        Assert.Null(end.Current);
        Assert.Equivalent(end.Session, await alice.SessionAsync(start.SessionId));

        var chosen = await alice.ChooseAsync(start.SessionId, 2, "safe");
        Assert.NotNull(chosen.Current!.PreviewUrl);
        Assert.Equal((6, 10m), (chosen.Current.Position, chosen.Current.ListenSeconds));
    }

    private Microsoft.Extensions.Diagnostics.Metrics.Testing.MetricCollector<long> Collect(string instrument) =>
        new(_run.Api.Services.GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>(), RunsMetrics.MeterName, instrument);

    private static string? Tag(Microsoft.Extensions.Diagnostics.Metrics.Testing.CollectedMeasurement<long> m, string key) =>
        m.Tags.TryGetValue(key, out var value) ? Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) : null;

    [Fact]
    public async Task Mesure_LaDifficulteChoisie_ParManche()
    {
        using var difficulties = Collect(RunsMetrics.DifficultiesName);
        var (alice, id, _) = await InRoundTwoAsync();
        using var cards = Collect(RunsMetrics.CardsName);

        await alice.ChooseAsync(id, 2, "risky");

        // Choisir la difficulté ne touche à aucune carte.
        Assert.Empty(cards.GetMeasurementSnapshot());

        var chosen = Assert.Single(difficulties.GetMeasurementSnapshot());
        Assert.Equal(("2", "risky"), (Tag(chosen, "round"), Tag(chosen, "difficulty")));
        // Une liste fermée d'étiquettes : un identifiant ajouté un jour ferait échouer ce test.
        Assert.Equal(["difficulty", "round"], chosen.Tags.Keys.Order());
    }

    [Fact]
    public async Task Choisir_Risquee_PointsEtObjectifALaDifficulte_PuisPlusDeChoix()
    {
        var (alice, id, code) = await InRoundTwoAsync();

        var chosen = await alice.ChooseAsync(id, 2, "risky");

        Assert.Equal(new RunRoundResponse(2, 0, 552, 885, "risky"), chosen.Session.Round);
        Assert.Null(chosen.Session.DifficultyChoice);
        Assert.Equal(6, chosen.Current!.Position);
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
    public async Task SansChoix_LaMancheSeJoueEnSure_CommeAuProto1_SansRienNoter()
    {
        var (alice, id, code) = await InRoundTwoAsync();

        var answer = await alice.AnswerAsync(id, code, 6);

        Assert.Equal(133, answer.Revealed!.Points);
        Assert.Equal("safe", answer.Session.Round!.Difficulty);
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.session_rounds WHERE session_id = {id}"));
    }

    [Fact]
    public async Task PendantLeChoix_LeChronoNeTournePas_IlRepartDuChoix()
    {
        var (alice, id, _) = await InRoundTwoAsync();

        // Une minute et demie sur l'écran de palier et de difficulté, sans annonce de son : le chrono n'est ni montré ni écoulé.
        _run.Game.Time.Advance(TimeSpan.FromSeconds(90));
        Assert.Null((await alice.SessionAsync(id)).ClockRemainingSeconds);

        await alice.ChooseAsync(id, 2, "safe");
        _run.Game.Time.Advance(TimeSpan.FromSeconds(40));
        Assert.Equal(35m, (await alice.SessionAsync(id)).ClockRemainingSeconds);
    }

    [Fact]
    public async Task LePremierMorceauSansExtrait_NeutraliseApresLeChoix_ALObjectifChoisi()
    {
        var (alice, id, code) = await InRoundTwoAsync();
        await _run.RemovePreviewAsync(await _run.TrackAtAsync(code, 6));

        var chosen = await alice.ChooseAsync(id, 2, "risky");

        // 552 pour 5 morceaux, 83 % des 4 restants (532) : 442.
        Assert.Equal([new RunNeutralizedResponse(6, 2, 552, 442)], chosen.Neutralized);
        Assert.Equal(7, chosen.Current!.Position);
    }

    [Fact]
    public async Task UneDifficulteNonProposee_400()
    {
        await _run.Game.SetSettingAsync(
            "Runs:Difficulties", """[{"difficulty":"safe","pointsFactor":1,"objectiveFactor":1},{"difficulty":"risky","pointsFactor":1.5,"objectiveFactor":1.2}]""");
        var (alice, id, _) = await InRoundTwoAsync();

        await GameAsserts.ProblemAsync(await alice.ChooseRawAsync(id, 2, "easy"), HttpStatusCode.BadRequest, "common.bad_request");
        Assert.Equal("risky", (await alice.ChooseAsync(id, 2, "risky")).Session.Round!.Difficulty);
    }

    [Fact]
    public async Task LeChoix_EstJournalise_SansPseudo()
    {
        var (alice, id, _) = await InRoundTwoAsync();

        await alice.ChooseAsync(id, 2, "risky");

        var entry = Assert.Single(_logs.Messages, m => m.Contains("manche 2 en risky", StringComparison.Ordinal));
        Assert.Contains($"Partie {id} de {alice.Id}", entry, StringComparison.Ordinal);
        Assert.DoesNotContain("Alice", entry, StringComparison.Ordinal);
    }

    [Fact]
    public async Task LaMancheBoss_EcouteDeCinqSecondes_EtPasPlus()
    {
        var (alice, id, code) = await InRoundTwoAsync();
        await alice.PlayAsync(id, code, 6, AllFound);
        var end = await alice.PlayAsync(id, code, 11, AllFound);
        Assert.Equal(5m, end.Session.DifficultyChoice!.Options.Single(o => o.Difficulty == "risky").ListenSeconds);

        var chosen = await alice.ChooseAsync(id, 4, "risky");
        Assert.Equal((16, 5m), (chosen.Current!.Position, chosen.Current.ListenSeconds));

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
