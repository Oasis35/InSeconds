using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Runs.Application;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Ce que l'écran de jeu en pile demande au serveur : tous les morceaux déjà joués et les manches passées (lignes de palier), la forme des morceaux
/// joués à la reprise seulement, et le chrono d'un morceau (départ au premier son, borné par l'envoi de l'extrait, réponse tardive à 0 point).
/// </summary>
public class RunPileClockTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string Base64Blob()
    {
        var bytes = new byte[4 + 180 + 1800];
        bytes[0] = 1;
        bytes[1] = 30;
        bytes[2] = 6;
        bytes[3] = 60;
        return Convert.ToBase64String(bytes);
    }

    private Task<HttpResponseMessage> ClockRawAsync(RunGamer gamer, int sessionId, int position) =>
        gamer.Client.PostAsJsonAsync($"/api/runs/sessions/{sessionId}/clock", new StartRunClock(position), Ct);

    [Fact]
    public async Task LaPile_TousLesMorceauxJoues_EtLesManchesPassees()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);

        await alice.PlayAsync(id, code, 1, true, true, false, true, true);
        var answer = await alice.AnswerAsync(id, code, 6, artist: true, title: false);

        var session = answer.Session;
        Assert.Equal([1, 2, 3, 4, 5, 6], session.PlayedTracks.Select(t => t.Position));
        Assert.Equal([1, 1, 1, 1, 1, 2], session.PlayedTracks.Select(t => t.Round));
        Assert.Equal([100, 100, 0, 100, 100, 67], session.PlayedTracks.Select(t => t.Points));
        Assert.All(session.PlayedTracks, t => Assert.NotNull(t.Artist));
        // La manche en cours ne garde que ses morceaux (les pastilles), la pile a tout.
        Assert.Equal([6], session.RoundTracks.Select(t => t.Position));
        Assert.Equal([new RunPassedRoundResponse(1, 400, 200, new RunDiscResponse("runs.discs.wax", 0))], session.PassedRounds);
        Assert.Equal(45, session.AnswerSeconds);
    }

    [Fact]
    public async Task LaFormeDesMorceauxJoues_SeulementAuDemarrageOuALaReprise()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        var base64 = Base64Blob();
        await _run.Api.ExecuteAsync($"UPDATE catalogue.tracks SET waveform = decode('{Convert.ToHexString(Convert.FromBase64String(base64))}', 'hex')");

        var answered = await alice.PlayAsync(id, code, 1, true, true);
        Assert.All(answered.Session.PlayedTracks, t => Assert.Null(t.Waveform));

        var resumed = await alice.JoinAsync(code);
        Assert.True(resumed.IsResuming);
        Assert.Equal([base64, base64], resumed.Session.PlayedTracks.Select(t => t.Waveform));
    }

    [Fact]
    public async Task LeChrono_PartAuPremierSon_UneSeuleFois_EtSeRetrouveALaReprise()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        Assert.Null(start.Session.ClockRemainingSeconds);
        Assert.True(await _run.Api.ScalarAsync<bool>($"SELECT current_served_at IS NOT NULL FROM runs.sessions WHERE id = {id}"));

        Assert.Equal(HttpStatusCode.NoContent, (await ClockRawAsync(alice, id, 1)).StatusCode);
        var first = await _run.Api.ScalarAsync<double>($"SELECT extract(epoch FROM current_clock_at)::float8 FROM runs.sessions WHERE id = {id}");
        Assert.Equal(HttpStatusCode.NoContent, (await ClockRawAsync(alice, id, 1)).StatusCode);
        Assert.Equal(first, await _run.Api.ScalarAsync<double>($"SELECT extract(epoch FROM current_clock_at)::float8 FROM runs.sessions WHERE id = {id}"));

        _run.Game.Time.Advance(TimeSpan.FromSeconds(12));
        var resumed = await alice.JoinAsync(code);
        Assert.Equal(33m, resumed.Session.ClockRemainingSeconds);

        // Un autre morceau que le morceau en cours : refusé (piège 35).
        Assert.Equal(HttpStatusCode.Conflict, (await ClockRawAsync(alice, id, 2)).StatusCode);

        // Le morceau suivant repart sans chrono.
        var next = await alice.AnswerAsync(id, code, 1);
        Assert.Null(next.Session.ClockRemainingSeconds);
        Assert.True(await _run.Api.ScalarAsync<bool>($"SELECT current_clock_at IS NULL FROM runs.sessions WHERE id = {id}"));
    }

    [Fact]
    public async Task UnPremierSonAnnonceTrop_Tard_PartALaLimiteApresLEnvoi()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var id = start.Session.SessionId;
        _run.Game.Time.Advance(TimeSpan.FromMinutes(10));

        await ClockRawAsync(alice, id, 1);

        var gap = await _run.Api.ScalarAsync<double>(
            $"SELECT extract(epoch FROM current_clock_at - current_served_at)::float8 FROM runs.sessions WHERE id = {id}");
        Assert.Equal(30, gap, 3);
    }

    [Fact]
    public async Task UneReponseApresLeChrono_RapporteZero_UneReponseALHeure_Compte()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);

        await ClockRawAsync(alice, id, 1);
        var onTime = await alice.AnswerAsync(id, code, 1);
        Assert.Equal(100, onTime.Revealed!.Points);

        await ClockRawAsync(alice, id, 2);
        // 45 s de chrono et 5 s de marge réseau : à 51 s, c'est trop tard.
        _run.Game.Time.Advance(TimeSpan.FromSeconds(51));
        var late = await alice.AnswerAsync(id, code, 2);
        Assert.Equal((false, false, 0), (late.Revealed!.ArtistCorrect, late.Revealed.TitleCorrect, late.Revealed.Points));
        // Le morceau révélé garde ses noms : le joueur voit ce qu'il fallait trouver.
        Assert.NotNull(late.Revealed.Artist);
    }

    [Fact]
    public async Task SansPremierSonAnnonce_LeChronoPartALaLimiteApresLEnvoi()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        // Envoyé il y a 81 s, jamais annoncé : départ à 30 s, fin du chrono à 75 s, marge à 80 s.
        _run.Game.Time.Advance(TimeSpan.FromSeconds(81));

        var late = await alice.AnswerAsync(id, code, 1);

        Assert.Equal(0, late.Revealed!.Points);
    }

    [Fact]
    public async Task UnePlaylistSansChrono_LesReponsesTardivesComptent()
    {
        await using var run = await RunGame.CreateAsync(
            await postgres.CreateDatabaseAsync(), settings: new Dictionary<string, string> { ["Runs:AnswerSeconds"] = "0" });
        var alice = await run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        run.Game.Time.Advance(TimeSpan.FromHours(1));

        var answer = await alice.AnswerAsync(id, code, 1);

        Assert.Equal(0, answer.Session.AnswerSeconds);
        Assert.Equal(100, answer.Revealed!.Points);
    }
}
