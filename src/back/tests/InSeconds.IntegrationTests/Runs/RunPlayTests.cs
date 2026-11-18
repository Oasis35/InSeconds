using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// La partie de la Série par HTTP : lancement (accès requis), lien d'un ami, verrou du morceau en cours, vies, paliers d'écoute, manches tirées à la volée,
/// neutralisation d'un morceau sans extrait, fin, record, abandon, et ce que portent les réponses pour les écrans (rien d'un morceau à venir, piège 31).
/// </summary>
public class RunPlayTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly CapturingLoggerProvider _logs = new();
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() =>
        _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), configureServices: s => s.AddSingleton<ILoggerProvider>(_logs));

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private static readonly bool[] AllFound = [true, true, true, true, true];
    private static readonly bool[] OneMissed = [true, true, false, true, true];

    [Fact]
    public async Task Me_SansIdentite_SansAcces_EtNeCreeRien()
    {
        var players = await _run.Api.ScalarAsync<long>("SELECT count(*) FROM players.players");

        var response = await _run.Api.CreateClient().GetAsync("/api/runs/me", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("""{"hasAccess":false,"record":null,"pending":null,"level":null,"received":null}""", await response.Content.ReadAsStringAsync(Ct));
        Assert.Equal(players, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM players.players"));
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Me_AccesPartieEnCoursEtRecord()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var bob = await _run.NewPlayerAsync("Bob");
        var nobody = await bob.MeAsync();
        Assert.Equal((false, null, null), (nobody.HasAccess, nobody.Record, nobody.Pending));

        var first = await alice.LaunchAsync();
        var me = await alice.MeAsync();
        Assert.True(me.HasAccess);
        Assert.Null(me.Record);
        Assert.Equal(new RunPendingResponse(first.Session.SessionId, first.Session.ChallengeCode), me.Pending);

        await alice.PlayAsync(first.Session.SessionId, first.Session.ChallengeCode, 1, false, false, false);
        me = await alice.MeAsync();
        Assert.Null(me.Pending);
        Assert.Equal(new RunRecordResponse(0, 0, false), me.Record);
    }

    [Fact]
    public async Task UnAdmin_ALAccesDOffice()
    {
        var admin = await _run.NewPlayerAsync("Admin");
        var client = _run.Api.CreateClient(new TestUser(admin.Id, IsAdmin: true));

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/runs/challenges", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task Lancer_SansAcces_403_InviteOuCompteNonAutorise_SansIdentite_401()
    {
        await GameAsserts.ProblemAsync(await (await _run.NewPlayerAsync()).LaunchRawAsync(), HttpStatusCode.Forbidden, RunsErrorCodes.AccessDenied);
        await GameAsserts.ProblemAsync(await (await _run.NewPlayerAsync("Bob")).LaunchRawAsync(), HttpStatusCode.Forbidden, RunsErrorCodes.AccessDenied);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _run.Api.CreateClient().PostAsync("/api/runs/challenges", null, Ct)).StatusCode);
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM runs.challenges"));
    }

    [Fact]
    public async Task Lancer_PoolInsuffisant_503()
    {
        await _run.Api.ExecuteAsync("UPDATE catalogue.tracks SET disabled_at = now() WHERE id > 4");
        var alice = await _run.NewInvitedAsync("Alice");

        await GameAsserts.ProblemAsync(await alice.LaunchRawAsync(), HttpStatusCode.ServiceUnavailable, RunsErrorCodes.NoChallenge);
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM runs.challenges"));
    }

    [Fact]
    public async Task Lancer_CreeLaPlaylistEtLaPartie_RendLEtatEtLExtraitDuPremierMorceauSeulement()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        _run.Api.FakeDeezer.Reset();

        var response = await alice.LaunchRawAsync();
        var json = await response.Content.ReadAsStringAsync(Ct);
        var play = JsonSerializer.Deserialize<RunPlayResponse>(json, JsonSerializerOptions.Web)!;

        var session = play.Session;
        Assert.Equal(("pending", 5, 3, 3, 0), (session.Status, session.TracksPerRound, session.Lives, session.LivesLeft, session.TotalScore));
        Assert.Equal(new RunRoundResponse(1, 0, 10m, 100, 0), session.Round);
        Assert.Empty(session.RoundTracks);
        Assert.Null(session.Finish);
        Assert.False(play.IsResuming);
        Assert.Equal((1, 1, 1, 10m), (play.Current!.Position, play.Current.Round, play.Current.PositionInRound, play.Current.ListenSeconds));
        Assert.NotNull(play.Current.PreviewUrl);
        Assert.Equal(1L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.sessions WHERE player_id = '{alice.Id}' AND status = 0"));
        Assert.Equal(alice.Id, await _run.Api.ScalarAsync<Guid>($"SELECT created_by FROM runs.challenges WHERE code = '{session.ChallengeCode}'"));
        // Seule la première manche est tirée : les suivantes le seront quand un joueur y arrivera.
        Assert.Equal(5L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{session.ChallengeCode}'"));

        // Piège 31 : rien qui identifie un morceau, et Deezer n'a été interrogé que pour le premier.
        Assert.DoesNotContain("Artiste", json, StringComparison.Ordinal);
        Assert.DoesNotContain("Titre", json, StringComparison.Ordinal);
        var first = await _run.TrackAtAsync(session.ChallengeCode, 1);
        Assert.Equal([$"/track/{1000 + first}"], _run.Api.FakeDeezer.Requests);
    }

    [Fact]
    public async Task MancheSansErreur_LePalierRaccourcit_LesPointsMontent_LaMancheSuivanteEstTiree()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        // La réponse révèle le morceau et ses points, puis l'extrait du suivant.
        var first = await alice.AnswerAsync(id, code, 1);
        var track = await _run.TrackAtAsync(code, 1);
        Assert.Equal(new RunTrackResponse(1, 1, false, true, true, 100, $"Artiste {track}", $"Titre {track}", null, 1000 + track), first.Revealed);
        Assert.Equal(new RunRoundResponse(1, 100, 10m, 100, 0), first.Session.Round);
        Assert.Equal([first.Revealed!], first.Session.RoundTracks);
        Assert.Equal(2, first.Current!.Position);
        Assert.Empty(first.RoundSummaries);

        var endOfRound = await alice.PlayAsync(id, code, 2, true, true, true, true);

        var summary = Assert.Single(endOfRound.RoundSummaries);
        Assert.Equal((1, 500, "shorter", 10m, 5m, 500, 3), (summary.Round, summary.Score, summary.Outcome, summary.ListenSeconds, summary.NextListenSeconds, summary.TotalScore, summary.LivesLeft));
        Assert.Equal([1, 2, 3, 4, 5], summary.Tracks.Select(t => t.Position));
        Assert.All(summary.Tracks, t => Assert.NotNull(t.Artist));
        Assert.Equal(new RunRoundResponse(2, 0, 5m, 200, 0), endOfRound.Session.Round);
        Assert.Empty(endOfRound.Session.RoundTracks);
        Assert.Equal((6, 2, 5m), (endOfRound.Current!.Position, endOfRound.Current.Round, endOfRound.Current.ListenSeconds));
        Assert.Equal([new RunPassedRoundResponse(1, 500, 10m, null)], endOfRound.Session.PassedRounds);
        Assert.Equal(1, endOfRound.Session.RoundsPassed);
        Assert.Equal(10L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{code}'"));
    }

    [Fact]
    public async Task LesPaliers_DescendentSansErreur_RemontentApresUneErreur_JamaisAuDessusDeDixSecondes()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        await alice.PlayAsync(id, code, 1, AllFound);
        await alice.PlayAsync(id, code, 6, AllFound);
        var third = await alice.PlayAsync(id, code, 11, OneMissed);

        var summary = Assert.Single(third.RoundSummaries);
        // Manche 3 au palier de 3 s (350 points) : quatre morceaux trouvés, un raté (une vie perdue), le palier s'allonge.
        Assert.Equal((3, 1400, "longer", 3m, 5m, 2, 2900), (summary.Round, summary.Score, summary.Outcome, summary.ListenSeconds, summary.NextListenSeconds, summary.LivesLeft, summary.TotalScore));
        Assert.Equal((5m, 1), (third.Current!.ListenSeconds, third.Session.Round!.Round - 3));
        Assert.Equal(2, third.Session.LivesLeft);

        // Une erreur au premier palier le laisse à 10 s.
        var second = (await alice.LaunchAsync()).Session;
        var after = await alice.PlayAsync(second.SessionId, second.ChallengeCode, 1, OneMissed);
        Assert.Equal(("same", 10m, 10m), (after.RoundSummaries.Single().Outcome, after.RoundSummaries.Single().ListenSeconds, after.RoundSummaries.Single().NextListenSeconds));
    }

    [Fact]
    public async Task UneMoitieJuste_ValeLaMoitieDesPoints_SansPerdreDeVie_EtLaisseLePalier()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        var first = await alice.AnswerAsync(id, code, 1, artist: true, title: false);
        Assert.Equal((true, false, 50, 3), (first.Revealed!.ArtistCorrect, first.Revealed.TitleCorrect, first.Revealed.Points, first.Session.LivesLeft));

        var end = await alice.PlayAsync(id, code, 2, [.. Enumerable.Repeat(true, 4)]);
        var summary = Assert.Single(end.RoundSummaries);
        Assert.Equal(("same", 10m, 10m, 450), (summary.Outcome, summary.ListenSeconds, summary.NextListenSeconds, summary.Score));
    }

    [Fact]
    public async Task TroisVies_UneErreurOuUnPasser_ChacunEnCouteUne_LaTroisiemeFinitLaPartie()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        var wrong = await alice.AnswerAsync(id, code, 1, artist: false, title: false);
        Assert.Equal(2, wrong.Session.LivesLeft);
        var passed = await alice.AnswerRawAsync(id, 2, null, null);
        Assert.Equal(1, (await passed.Content.ReadFromJsonAsync<RunPlayResponse>(Ct))!.Session.LivesLeft);

        var last = await alice.AnswerAsync(id, code, 3, artist: false, title: false);

        Assert.Equal(0, last.Session.LivesLeft);
        Assert.Null(last.Current);
        Assert.Null(last.Session.Round);
        var finish = last.Session.Finish!;
        Assert.Equal(("lost", 0, 0, 0, 3, code), (finish.Status, finish.TotalScore, finish.RoundsPassed, finish.FoundCount, finish.TrackCount, finish.ChallengeCode));
        Assert.Equal(3, finish.Tracks.Count);
        await GameAsserts.ProblemAsync(await alice.AnswerRawAsync(id, 4, "a", "b"), HttpStatusCode.Conflict, RunsErrorCodes.AlreadyPlayed);
        await GameAsserts.ProblemAsync(await alice.JoinRawAsync(code), HttpStatusCode.Conflict, RunsErrorCodes.AlreadyPlayed);
    }

    [Fact]
    public async Task PartiePerdueEnCoursDeManche_LeScoreEtLeRecord_ContentLesManchesTenues()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);

        await alice.PlayAsync(id, code, 1, AllFound);
        // Manche 2 (5 s, 200 points) : un morceau trouvé, puis trois ratés.
        var last = await alice.PlayAsync(id, code, 6, true, false, false, false);

        Assert.Null(last.Current);
        var finish = last.Session.Finish!;
        Assert.Equal(("lost", 700, 1, 6, 9), (finish.Status, finish.TotalScore, finish.RoundsPassed, finish.FoundCount, finish.TrackCount));
        Assert.Equal(new RunRecordResponse(700, 1, true), finish.Record);
        Assert.Equal(9, finish.Tracks.Count);
        Assert.Equal(2, await _run.Api.ScalarAsync<short>($"SELECT status FROM runs.sessions WHERE id = {id}"));
        Assert.Equal(700, await _run.Api.ScalarAsync<int>($"SELECT best_score FROM runs.records WHERE player_id = '{alice.Id}'"));
        Assert.Equal(1, await _run.Api.ScalarAsync<short>($"SELECT best_rounds_passed FROM runs.records WHERE player_id = '{alice.Id}'"));

        // L'état relu donne le même résultat de fin.
        Assert.Equal(JsonSerializer.Serialize(last.Session), JsonSerializer.Serialize(await alice.SessionAsync(id)));
    }

    [Fact]
    public async Task Metrique_NiveauApresUnePartie_DisqueEtChangement_SansIdentifiant()
    {
        var factory = _run.Api.Services.GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>();
        using var levels = new Microsoft.Extensions.Diagnostics.Metrics.Testing.MetricCollector<long>(factory, RunsMetrics.MeterName, RunsMetrics.LevelsName);
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;

        await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, false, false, false);

        var measure = Assert.Single(levels.GetMeasurementSnapshot());
        Assert.Equal(["change", "disc"], measure.Tags.Keys.Order());
        // Une partie ratée à 0 point depuis un niveau neuf : toujours pas de disque.
        Assert.Equal(RunsMetrics.NoDisc, measure.Tags["disc"]);
        Assert.Equal(RunsMetrics.LevelSame, measure.Tags["change"]);
    }

    [Fact]
    public async Task UnRecordMoindre_RappelleLeRecord()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var good = (await alice.LaunchAsync()).Session;
        await alice.PlayAsync(good.SessionId, good.ChallengeCode, 1, AllFound);
        await alice.PlayAsync(good.SessionId, good.ChallengeCode, 6, false, false, false);

        var bad = (await alice.LaunchAsync()).Session;
        var last = await alice.PlayAsync(bad.SessionId, bad.ChallengeCode, 1, false, false, false);

        Assert.Equal(new RunRecordResponse(500, 1, false), last.Session.Finish!.Record);
        Assert.Equal(good.SessionId, await _run.Api.ScalarAsync<int>($"SELECT session_id FROM runs.records WHERE player_id = '{alice.Id}'"));
    }

    [Fact]
    public async Task Abandon_TermineLaPartie_SansRecord()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        await alice.AnswerAsync(start.SessionId, start.ChallengeCode, 1);

        Assert.Equal(HttpStatusCode.NoContent, (await alice.AbandonRawAsync(start.SessionId)).StatusCode);

        var state = await alice.SessionAsync(start.SessionId);
        Assert.Equal(("abandoned", 100), (state.Status, state.Finish!.TotalScore));
        Assert.Null(state.Finish.Record);
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM runs.records"));
        await GameAsserts.ProblemAsync(await alice.AnswerRawAsync(start.SessionId, 2, "a", "b"), HttpStatusCode.Conflict, RunsErrorCodes.Abandoned);
        await GameAsserts.ProblemAsync(await alice.AbandonRawAsync(start.SessionId), HttpStatusCode.Conflict, RunsErrorCodes.Abandoned);
        await GameAsserts.ProblemAsync(await alice.JoinRawAsync(start.ChallengeCode), HttpStatusCode.Conflict, RunsErrorCodes.Abandoned);
    }

    [Fact]
    public async Task UnAmiAutorise_ReleveLaPlaylist_UneSeuleFois_LesMemesMorceaux()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var code = (await alice.LaunchAsync()).Session.ChallengeCode;
        var friend = await _run.NewInvitedAsync();

        var link = await friend.ChallengeAsync(code.ToLowerInvariant());
        Assert.Equal(new RunChallengeResponse(code, "Alice", 3, 5, 10m, "none", null, 45), link);

        var joined = await friend.JoinAsync(code.ToLowerInvariant());
        Assert.False(joined.IsResuming);
        Assert.Equal(code, joined.Session.ChallengeCode);
        Assert.Equal(1, joined.Current!.Position);
        Assert.Equal(("pending", joined.Session.SessionId), ((await friend.ChallengeAsync(code)).MyStatus, (await friend.ChallengeAsync(code)).MySessionId));

        // Reprise : la même partie, au morceau en cours.
        await friend.AnswerAsync(joined.Session.SessionId, code, 1);
        var resumed = await friend.JoinAsync(code);
        Assert.True(resumed.IsResuming);
        Assert.Equal(joined.Session.SessionId, resumed.Session.SessionId);
        Assert.Equal(2, resumed.Current!.Position);
        Assert.Single(resumed.Session.RoundTracks);
        Assert.Equal(1L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.sessions WHERE player_id = '{friend.Id}'"));
    }

    [Fact]
    public async Task LeLienDUnAmi_NOuvrePasLeMode_SansAcces_403_InviteOuCompteNonAutorise()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var code = (await alice.LaunchAsync()).Session.ChallengeCode;

        await GameAsserts.ProblemAsync(await (await _run.NewPlayerAsync()).JoinRawAsync(code), HttpStatusCode.Forbidden, RunsErrorCodes.AccessDenied);
        await GameAsserts.ProblemAsync(await (await _run.NewPlayerAsync("Bob")).JoinRawAsync(code), HttpStatusCode.Forbidden, RunsErrorCodes.AccessDenied);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _run.Api.CreateClient().PostAsync($"/api/runs/challenges/{code}/sessions", null, Ct)).StatusCode);
        Assert.Equal(1L, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM runs.sessions"));
    }

    [Fact]
    public async Task UnAmiQuiVaPlusLoin_TireLesManchesSuivantes_QueLAuteurRetrouveIdentiques()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var friend = await _run.NewInvitedAsync();
        var joined = (await friend.JoinAsync(start.ChallengeCode)).Session;

        await friend.PlayAsync(joined.SessionId, start.ChallengeCode, 1, AllFound);
        var tracksOfRound2 = await _run.Api.ScalarAsync<string>($"SELECT string_agg(track_id::text, ',' ORDER BY position) FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{start.ChallengeCode}' AND t.round = 2");
        var second = await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, AllFound);

        // La manche tirée par l'ami n'est pas retirée : l'auteur joue les mêmes morceaux.
        Assert.Equal(tracksOfRound2, await _run.Api.ScalarAsync<string>($"SELECT string_agg(track_id::text, ',' ORDER BY position) FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{start.ChallengeCode}' AND t.round = 2"));
        Assert.Equal(6, second.Current!.Position);
        Assert.Equal(10L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{start.ChallengeCode}'"));
    }

    [Fact]
    public async Task LeLien_AnonymePermis_CodeInconnu404_AuteurEfface()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var code = (await alice.LaunchAsync()).Session.ChallengeCode;
        var anonymous = _run.Api.CreateClient();

        var response = await anonymous.GetAsync($"/api/runs/challenges/{code}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"myStatus\":\"none\"", await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);

        await GameAsserts.ProblemAsync(await anonymous.GetAsync("/api/runs/challenges/ZZZZZZ", Ct), HttpStatusCode.NotFound, RunsErrorCodes.ChallengeNotFound);
        await GameAsserts.ProblemAsync(await anonymous.GetAsync("/api/runs/challenges/pas-un-code", Ct), HttpStatusCode.NotFound, RunsErrorCodes.ChallengeNotFound);
        await GameAsserts.ProblemAsync(await (await _run.NewInvitedAsync()).JoinRawAsync("ZZZZZZ"), HttpStatusCode.NotFound, RunsErrorCodes.ChallengeNotFound);

        await _run.Api.ExecuteAsync($"UPDATE runs.challenges SET created_by = NULL WHERE code = '{code}'");
        Assert.Null((await (await _run.NewPlayerAsync()).ChallengeAsync(code)).AuthorPseudo);
    }

    [Fact]
    public async Task LaPartieDUnAutre_EstUnePartieInconnue()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var id = (await alice.LaunchAsync()).Session.SessionId;
        var bob = await _run.NewInvitedAsync("Bob");

        await GameAsserts.ProblemAsync(await bob.SessionRawAsync(id), HttpStatusCode.NotFound, RunsErrorCodes.SessionNotFound);
        await GameAsserts.ProblemAsync(await bob.AnswerRawAsync(id, 1, "a", "b"), HttpStatusCode.NotFound, RunsErrorCodes.SessionNotFound);
        await GameAsserts.ProblemAsync(await bob.ListenRawAsync(id, 1, 10), HttpStatusCode.NotFound, RunsErrorCodes.SessionNotFound);
        await GameAsserts.ProblemAsync(await bob.PreviewRawAsync(id), HttpStatusCode.NotFound, RunsErrorCodes.SessionNotFound);
        await GameAsserts.ProblemAsync(await bob.AbandonRawAsync(id), HttpStatusCode.NotFound, RunsErrorCodes.SessionNotFound);
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.answers WHERE session_id = {id}"));
    }

    [Fact]
    public async Task LeVerrou_UnAutreMorceauQueLeMorceauEnCours_EstRefuse()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var id = start.SessionId;

        await GameAsserts.ProblemAsync(await alice.AnswerRawAsync(id, 2, "a", "b"), HttpStatusCode.Conflict, RunsErrorCodes.TrackLockNotReleased);
        await GameAsserts.ProblemAsync(await alice.ListenRawAsync(id, 2, 10), HttpStatusCode.Conflict, RunsErrorCodes.TrackLockNotReleased);
        await alice.AnswerAsync(id, start.ChallengeCode, 1);
        await GameAsserts.ProblemAsync(await alice.AnswerRawAsync(id, 1, "a", "b"), HttpStatusCode.Conflict, RunsErrorCodes.AlreadyAnswered);
    }

    [Fact]
    public async Task LEcoute_EstNotee_JusquAuPalierDeLaManche()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var id = start.SessionId;

        Assert.Equal(HttpStatusCode.NoContent, (await alice.ListenRawAsync(id, 1, 10)).StatusCode);
        Assert.Equal(10m, await _run.Api.ScalarAsync<decimal>($"SELECT current_listened_seconds FROM runs.sessions WHERE id = {id}"));
        await GameAsserts.ProblemAsync(await alice.ListenRawAsync(id, 1, 10.5m), HttpStatusCode.BadRequest, "common.bad_request");
        Assert.Equal(HttpStatusCode.BadRequest, (await alice.ListenRawAsync(id, 1, 0)).StatusCode);

        // À la manche 2, le palier est de 5 s : 10 s est refusé.
        await alice.PlayAsync(id, start.ChallengeCode, 1, AllFound);
        Assert.Equal(HttpStatusCode.NoContent, (await alice.ListenRawAsync(id, 6, 5)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await alice.ListenRawAsync(id, 6, 10)).StatusCode);
    }

    [Fact]
    public async Task PasserLeMorceau_ZeroPoint_UneVieDeMoins()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var id = (await alice.LaunchAsync()).Session.SessionId;

        var response = await alice.AnswerRawAsync(id, 1, null, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, await _run.Api.ScalarAsync<int>($"SELECT points FROM runs.answers WHERE session_id = {id} AND position = 1"));
        Assert.Equal(2, (await alice.SessionAsync(id)).LivesLeft);
    }

    [Fact]
    public async Task Reponse_TitreAlternatif_CompteCommeBonneReponse()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);
        var trackId = await _run.TrackAtAsync(code, 1);
        await _run.Api.ExecuteAsync($"UPDATE catalogue.tracks SET alt_titles = ARRAY['22h31 - Alias {trackId}'] WHERE id = {trackId}");

        var response = await alice.AnswerRawAsync(id, 1, $"Artiste {trackId}", $"22h31 - Alias {trackId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var revealed = (await response.Content.ReadFromJsonAsync<RunPlayResponse>(Ct))!.Revealed!;
        Assert.Equal((true, true), (revealed.ArtistCorrect, revealed.TitleCorrect));
    }

    [Fact]
    public async Task MorceauSansExtrait_Neutralise_NeCompteNiPointNiVie_PuisLExtraitDuSuivant()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);
        await _run.RemovePreviewAsync(await _run.TrackAtAsync(code, 2));

        var answer = await alice.AnswerAsync(id, code, 1);

        Assert.Equal([new RunNeutralizedResponse(2, 1)], answer.Neutralized);
        Assert.Equal(3, answer.Current!.Position);
        Assert.Equal(new RunRoundResponse(1, 100, 10m, 100, 0), answer.Session.Round);
        Assert.Equal(3, answer.Session.LivesLeft);
        Assert.Equal(
            [new RunTrackResponse(2, 1, true, false, false, 0, null, null, null, null)], answer.Session.RoundTracks.Where(t => t.Neutralized));
        Assert.True(await _run.Api.ScalarAsync<bool>($"SELECT neutralized FROM runs.answers WHERE session_id = {id} AND position = 2"));
        await GameAsserts.ProblemAsync(await alice.AnswerRawAsync(id, 2, "a", "b"), HttpStatusCode.Conflict, RunsErrorCodes.AlreadyAnswered);
    }

    [Fact]
    public async Task UneMancheEntierementNeutralisee_EstPassee_SansChangerLePalier_EtLaSuivanteSeTire()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);
        // La manche 2 tire dans la deuxième tranche de rang : les morceaux 6 à 10 du pool de test.
        foreach (var trackId in Enumerable.Range(6, 5))
            await _run.RemovePreviewAsync(trackId);

        var last = await alice.PlayAsync(id, code, 1, AllFound);

        Assert.Equal([6, 7, 8, 9, 10], last.Neutralized.Select(n => n.Position));
        Assert.Equal([1, 2], last.RoundSummaries.Select(s => s.Round));
        Assert.Equal((0, "same", 5m), (last.RoundSummaries[1].Score, last.RoundSummaries[1].Outcome, last.RoundSummaries[1].ListenSeconds));
        Assert.Equal(2, last.Session.RoundsPassed);
        Assert.Equal(11, last.Current!.Position);
        Assert.Equal(3, last.Session.LivesLeft);
    }

    [Fact]
    public async Task DeezerIndisponible_LeMorceauResteEnCours_SansNeutralisation_EtLeJoueurReessaie()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var (id, code) = (start.SessionId, start.ChallengeCode);
        var second = await _run.TrackAtAsync(code, 2);
        await _run.MakePreviewUnavailableAsync(second);

        var answer = await alice.AnswerAsync(id, code, 1);
        Assert.Empty(answer.Neutralized);
        Assert.Equal((2, (string?)null), (answer.Current!.Position, answer.Current.PreviewUrl));

        var retry = await alice.PreviewAsync(id);
        Assert.Null(retry.Current!.PreviewUrl);

        await _run.RestorePreviewAsync(second);
        retry = await alice.PreviewAsync(id);
        Assert.Equal(2, retry.Current!.Position);
        Assert.NotNull(retry.Current.PreviewUrl);
        Assert.Empty(retry.Neutralized);
        Assert.Equal(1L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.answers WHERE session_id = {id}"));
    }

    [Fact]
    public async Task LaRedemandeDExtrait_NeutraliseSiDeezerNEnAPlus()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        await _run.RemovePreviewAsync(await _run.TrackAtAsync(start.ChallengeCode, 1));

        var retry = await alice.PreviewAsync(start.SessionId);

        Assert.Equal([1], retry.Neutralized.Select(n => n.Position));
        Assert.Equal(2, retry.Current!.Position);
    }

    [Fact]
    public async Task UnReglageChangeEnCoursDePartie_NeChangeRienALaPartie()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        await _run.Game.SetSettingAsync("Runs:TracksPerRound", "3");
        await _run.Game.SetSettingAsync("Runs:Lives", "1");
        await _run.Game.SetSettingAsync("Runs:ListenLadder", "[8,4]");
        await _run.Game.SetSettingAsync("Runs:StepPoints", "[10,20]");

        var last = await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, AllFound);

        var summary = Assert.Single(last.RoundSummaries);
        Assert.Equal((500, 10m, 5m), (summary.Score, summary.ListenSeconds, summary.NextListenSeconds));
        Assert.Equal((5, 3, 3), (last.Session.TracksPerRound, last.Session.Lives, last.Session.LivesLeft));
        Assert.Equal(HttpStatusCode.NoContent, (await alice.ListenRawAsync(start.SessionId, 6, 5)).StatusCode);
    }

    [Fact]
    public async Task DeuxDemarragesSimultanes_UneSeulePartie()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var code = (await alice.LaunchAsync()).Session.ChallengeCode;
        var friend = await _run.NewInvitedAsync();

        var responses = await Task.WhenAll(friend.JoinRawAsync(code), friend.JoinRawAsync(code), friend.JoinRawAsync(code));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(1L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.sessions WHERE player_id = '{friend.Id}'"));
    }

    [Fact]
    public async Task LesJournaux_NeContiennentJamaisLaReponseSaisie()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var id = (await alice.LaunchAsync()).Session.SessionId;

        (await alice.AnswerRawAsync(id, 1, "ReponseSecreteArtiste", "ReponseSecreteTitre")).EnsureSuccessStatusCode();

        Assert.Contains(_logs.Messages, m => m.Contains($"partie {id}", StringComparison.Ordinal) && m.Contains("artiste False", StringComparison.Ordinal));
        Assert.DoesNotContain(_logs.Messages, m => m.Contains("ReponseSecrete", StringComparison.Ordinal));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

/// <summary>Les limites de débit du mode Run, activées pour cette classe seulement.</summary>
public class RunRateLimitTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() =>
        _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), settings: new Dictionary<string, string> { ["RateLimiting:Enabled"] = "true" });

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    [Fact]
    public async Task Lancer_20ParJoueur_429AuDela()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        for (var i = 0; i < 20; i++)
            Assert.Equal(HttpStatusCode.OK, (await alice.LaunchRawAsync()).StatusCode);

        await GameAsserts.ProblemAsync(await alice.LaunchRawAsync(), HttpStatusCode.TooManyRequests, "common.too_many_requests");
        // Par joueur : un autre joueur derrière la même IP n'est pas gêné.
        Assert.Equal(HttpStatusCode.OK, (await (await _run.NewInvitedAsync("Bob")).LaunchRawAsync()).StatusCode);
    }

    [Fact]
    public async Task LireUnLien_60ParIP_429AuDela()
    {
        var client = _run.Api.CreateClient();
        for (var i = 0; i < 60; i++)
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/runs/challenges/ZZZZZZ", Ct)).StatusCode);

        await GameAsserts.ProblemAsync(await client.GetAsync("/api/runs/challenges/ZZZZZZ", Ct), HttpStatusCode.TooManyRequests, "common.too_many_requests");
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}

/// <summary>Les compteurs OpenTelemetry du mode Run (<see cref="RunsMetrics"/>), sans identifiant de joueur, de morceau ni de playlist.</summary>
public class RunsMetricsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private Microsoft.Extensions.Diagnostics.Metrics.Testing.MetricCollector<long> Collect(string instrument) =>
        new(_run.Api.Services.GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>(), RunsMetrics.MeterName, instrument);

    private static string? Tag(Microsoft.Extensions.Diagnostics.Metrics.Testing.CollectedMeasurement<long> m, string key) =>
        m.Tags.TryGetValue(key, out var value) ? Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) : null;

    [Fact]
    public async Task Parties_Reponses_Neutralisations_ManchesEtDefaite()
    {
        using var sessions = Collect(RunsMetrics.SessionsName);
        using var answers = Collect(RunsMetrics.AnswersName);
        using var neutralized = Collect(RunsMetrics.NeutralizedName);
        using var rounds = Collect(RunsMetrics.RoundsName);
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        await _run.RemovePreviewAsync(await _run.TrackAtAsync(start.ChallengeCode, 3));
        await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, false, false);
        await alice.AnswerAsync(start.SessionId, start.ChallengeCode, 4, artist: false, title: false);
        var friend = await _run.NewInvitedAsync();
        var joined = (await friend.JoinAsync(start.ChallengeCode)).Session;
        await friend.JoinAsync(start.ChallengeCode);
        (await friend.AbandonRawAsync(joined.SessionId)).EnsureSuccessStatusCode();

        Assert.Equal(
            [RunsMetrics.Launched, RunsMetrics.Lost, RunsMetrics.Joined, RunsMetrics.Abandoned],
            sessions.GetMeasurementSnapshot().Select(m => Tag(m, "event")));
        Assert.Equal(3, answers.GetMeasurementSnapshot().Count);
        Assert.All(answers.GetMeasurementSnapshot(), m => Assert.Equal(["artist_found", "round", "title_found"], m.Tags.Keys.Order()));
        Assert.Single(neutralized.GetMeasurementSnapshot());
        // Une partie perdue dit la manche où elle s'est arrêtée, pour régler les paliers ; la manche perdue en route n'est pas un bilan de manche.
        var lost = sessions.GetMeasurementSnapshot().Single(m => Tag(m, "event") == RunsMetrics.Lost);
        Assert.Equal("1", Tag(lost, "round"));
        Assert.Equal(["event", "round"], lost.Tags.Keys.Order());
        Assert.Empty(rounds.GetMeasurementSnapshot());
    }

    [Fact]
    public async Task UneMancheTerminee_DitSonIssue_RaccourcieAllongeeOuIdentique()
    {
        using var rounds = Collect(RunsMetrics.RoundsName);
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;

        await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, true, true, true, true, true);
        await alice.PlayAsync(start.SessionId, start.ChallengeCode, 6, true, true, false, true, true);

        var measures = rounds.GetMeasurementSnapshot();
        Assert.Equal([("1", "shorter"), ("2", "longer")], measures.Select(m => (Tag(m, "round")!, Tag(m, "outcome")!)));
    }
}

/// <summary>Garde le texte de chaque journal écrit par l'API.</summary>
internal sealed class CapturingLoggerProvider : ILoggerProvider
{
    private readonly System.Collections.Concurrent.ConcurrentQueue<string> _messages = new();

    public IReadOnlyCollection<string> Messages => _messages;

    public ILogger CreateLogger(string categoryName) => new Logger(this);

    public void Dispose()
    {
    }

    private sealed class Logger(CapturingLoggerProvider owner) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            owner._messages.Enqueue(formatter(state, exception));
    }
}
