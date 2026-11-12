using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// L'historique du joueur sur le mode Run (<c>GET /api/runs/history</c>, proto 4) : ses parties gagnées ou perdues, un mois à la fois, avec un résumé de
/// tout, et l'extrait d'un morceau déjà joué d'une partie finie. Il ne lit que ses propres parties.
/// </summary>
public class RunHistoryTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private static readonly bool[] AllFound = [true, true, true, true, true];
    private static readonly bool[] NoneFound = [false, false, false, false, false];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<RunHistoryResponse> HistoryAsync(RunGamer gamer, string? month = null) =>
        (await gamer.Client.GetFromJsonAsync<RunHistoryResponse>(month is null ? "/api/runs/history" : $"/api/runs/history?month={month}", Ct))!;

    /// <summary>Alice gagne une partie (rangée au 20 septembre), en perd une autre (le jour de jeu) et en abandonne une troisième.</summary>
    private async Task<(RunGamer Alice, int Won, int Lost, string LostCode)> SeedAsync()
    {
        var alice = await _run.NewInvitedAsync("Alice");

        var first = await alice.LaunchAsync();
        await alice.PlayAsync(first.Session.SessionId, first.Session.ChallengeCode, 1, [.. AllFound, .. AllFound, .. AllFound, .. AllFound]);
        await _run.Api.ExecuteAsync($"UPDATE runs.sessions SET ended_at = '2026-09-20 10:00:00+00' WHERE id = {first.Session.SessionId}");

        var second = await alice.LaunchAsync();
        await alice.PlayAsync(second.Session.SessionId, second.Session.ChallengeCode, 1, [.. AllFound, .. NoneFound]);
        await _run.Api.ExecuteAsync(
            $"INSERT INTO runs.session_rounds (session_id, round, difficulty, chosen_at) VALUES ({second.Session.SessionId}, 2, 3, now()) ON CONFLICT DO NOTHING");

        var third = await alice.LaunchAsync();
        await alice.AbandonRawAsync(third.Session.SessionId);

        return (alice, first.Session.SessionId, second.Session.SessionId, second.Session.ChallengeCode);
    }

    [Fact]
    public async Task LeMoisEnCours_LaPartiePerdue_LAbandonNEstPasLa_LeResumeCompteTout()
    {
        var (alice, _, lost, code) = await SeedAsync();

        var history = await HistoryAsync(alice);

        Assert.Equal(("2026-10", "2026-09", (string?)null), (history.Month, history.PreviousMonth, history.NextMonth));
        Assert.Equal(2, history.PlayedCount);
        var run = Assert.Single(history.Runs);
        Assert.Equal((lost, code, "lost", "risky", 1), (run.SessionId, run.ChallengeCode, run.Status, run.Difficulty, run.RoundsPassed));
        Assert.Equal(DailyApi.Today, run.Date);
        Assert.Equal("runs.discs.wax", run.Disc.Key);
        // Le résumé porte sur les deux parties : le record est celle de septembre.
        Assert.True(history.BestScore > run.Score);
        Assert.Equal((int)Math.Round((history.BestScore!.Value + run.Score) / 2.0, MidpointRounding.AwayFromZero), history.AverageScore);
    }

    [Fact]
    public async Task UnMoisPasse_LaPartieGagnee_EtLesFleches()
    {
        var (alice, won, _, _) = await SeedAsync();

        var history = await HistoryAsync(alice, "2026-09");

        Assert.Equal(("2026-09", (string?)null, "2026-10"), (history.Month, history.PreviousMonth, history.NextMonth));
        var run = Assert.Single(history.Runs);
        Assert.Equal((won, "won", new DateOnly(2026, 9, 20), "safe"), (run.SessionId, run.Status, run.Date, run.Difficulty));
        Assert.Equal(4, run.RoundsPassed);
        Assert.Empty((await HistoryAsync(alice, "2026-07")).Runs);
    }

    [Fact]
    public async Task JoueurSansPartie_ListeVide_ResumeVide()
    {
        var alice = await _run.NewInvitedAsync("Alice");

        var history = await HistoryAsync(alice);

        Assert.Equal((0, null, null), (history.PlayedCount, history.AverageScore, history.BestScore));
        Assert.Empty(history.Runs);
    }

    [Fact]
    public async Task UnJoueur_NeLitQueSesParties_MemeSansAccesAuMode()
    {
        var (alice, _, _, code) = await SeedAsync();
        // Un invité qui joue la playlist d'Alice n'a pas l'accès au mode : son historique est le sien.
        var guest = await _run.NewPlayerAsync();
        var joined = await guest.JoinAsync(code);
        await guest.PlayAsync(joined.Session.SessionId, code, 1, NoneFound);

        var theirs = await HistoryAsync(guest);

        Assert.Equal(1, theirs.PlayedCount);
        Assert.Equal(joined.Session.SessionId, Assert.Single(theirs.Runs).SessionId);
        Assert.Equal(2, (await HistoryAsync(alice)).PlayedCount);
        Assert.DoesNotContain(guest.Id.ToString(), await alice.Client.GetStringAsync("/api/runs/history", Ct), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task MoisMalEcrit_400_PasDIdentite_401()
    {
        var alice = await _run.NewInvitedAsync("Alice");

        await GameAsserts.ProblemAsync(await alice.Client.GetAsync("/api/runs/history?month=2026-13", Ct), HttpStatusCode.BadRequest, RunsErrorCodes.InvalidMonth);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _run.Api.CreateClient().GetAsync("/api/runs/history", Ct)).StatusCode);
    }

    [Fact]
    public async Task ExtraitDUnMorceauJoue_SeulementDeSaPartieFinie()
    {
        var (alice, _, lost, _) = await SeedAsync();
        var other = await _run.NewPlayerAsync();
        var pending = await alice.LaunchAsync();
        await alice.AnswerAsync(pending.Session.SessionId, pending.Session.ChallengeCode, 1);

        var played = await alice.Client.GetFromJsonAsync<RunPastPreviewResponse>($"/api/runs/sessions/{lost}/tracks/1/preview", Ct);

        Assert.False(string.IsNullOrEmpty(played!.PreviewUrl));
        // Un morceau pas joué de cette partie perdue, une partie en cours, la partie d'un autre joueur, un morceau hors playlist : tous 404.
        foreach (var (client, path) in new[]
        {
            (alice.Client, $"/api/runs/sessions/{lost}/tracks/20/preview"),
            (alice.Client, $"/api/runs/sessions/{pending.Session.SessionId}/tracks/1/preview"),
            (other.Client, $"/api/runs/sessions/{lost}/tracks/1/preview"),
            (alice.Client, $"/api/runs/sessions/{lost}/tracks/99/preview"),
        })
            await GameAsserts.ProblemAsync(await client.GetAsync(path, Ct), HttpStatusCode.NotFound, RunsErrorCodes.TrackNotFound);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _run.Api.CreateClient().GetAsync($"/api/runs/sessions/{lost}/tracks/1/preview", Ct)).StatusCode);
    }
}
