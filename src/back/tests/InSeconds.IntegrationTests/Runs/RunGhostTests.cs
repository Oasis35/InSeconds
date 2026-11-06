using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Le fantôme d'un ami (<c>session.ghost</c>) : celui qui a lancé la playlist, quand un autre joueur la joue par son lien et qu'il l'a finie. Son
/// total après chaque morceau, seulement jusqu'au dernier que le joueur a répondu ; jamais de fantôme de soi-même (décision du 05/11/2026).
/// </summary>
public class RunGhostTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    [Fact]
    public async Task LAmiQuiALanceLaPlaylist_SonTotalJusquAuMorceauRepondu_RienDAvance()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        var code = start.ChallengeCode;

        // Alice n'a pas fini : pas de fantôme pour Carole.
        var carole = await _run.NewPlayerAsync();
        var caroleStart = (await carole.JoinAsync(code)).Session;
        var caroleAfter = await carole.AnswerAsync(caroleStart.SessionId, code, 1);
        Assert.Null(caroleAfter.Session.Ghost);

        // Alice : 3 morceaux trouvés sur 5 (300 pts, manche passée), puis une manche 2 ratée : partie perdue.
        var aliceEnd = await alice.PlayAsync(start.SessionId, code, 1, true, true, true, false, false);
        aliceEnd = await alice.PlayAsync(start.SessionId, code, 6, false, false, false, false, false);
        Assert.Equal("lost", aliceEnd.Session.Status);
        // Pas de fantôme de sa propre partie.
        Assert.Null(aliceEnd.Session.Ghost);

        var bob = await _run.NewPlayerAsync("Bob");
        var bobStart = (await bob.JoinAsync(code)).Session;
        Assert.Null(bobStart.Ghost);

        var first = await bob.AnswerAsync(bobStart.SessionId, code, 1, artist: false, title: false);
        Assert.Equal("Alice", first.Session.Ghost!.Pseudo);
        Assert.Equal([100], first.Session.Ghost.Totals);

        var second = await bob.AnswerAsync(bobStart.SessionId, code, 2);
        Assert.Equal("Alice", second.Session.Ghost!.Pseudo);
        Assert.Equal([100, 200], second.Session.Ghost.Totals);
        Assert.Equal(100, second.Session.TotalScore);

        // Relue, la partie rend le même fantôme (reprise).
        Assert.Equal([100, 200], (await bob.SessionAsync(bobStart.SessionId)).Ghost!.Totals);
    }
}
