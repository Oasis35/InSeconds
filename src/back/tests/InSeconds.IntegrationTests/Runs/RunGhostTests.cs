using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Le fantôme d'un ami (<c>session.ghost</c>) : celui qui a lancé la playlist, quand un autre joueur la joue par son lien et qu'il l'a finie. Son
/// total sur les morceaux que le joueur a joués, jusqu'au dernier qu'il a répondu ; jamais de fantôme de soi-même (décision du 05/11/2026), rien
/// une fois sa partie finie.
/// </summary>
public class RunGhostTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private static readonly bool[] AllFound = [true, true, true, true, true];

    /// <summary>Alice lance la playlist, trouve 3 morceaux sur 5 (300 pts, manche passée) puis rate la manche 2 : perdue au morceau 10.</summary>
    private async Task<(RunGamer Alice, string Code)> AliceLosesAtRoundTwoAsync()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, true, true, true, false, false);
        var end = await alice.PlayAsync(start.SessionId, start.ChallengeCode, 6, false, false, false, false, false);
        Assert.Equal("lost", end.Session.Status);
        // Pas de fantôme de sa propre partie.
        Assert.Null(end.Session.Ghost);
        return (alice, start.ChallengeCode);
    }

    [Fact]
    public async Task AuteurPasEncoreAuBout_PasDeFantome_PuisIlArriveEnCoursDePartie()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var aliceStart = (await alice.LaunchAsync()).Session;
        var code = aliceStart.ChallengeCode;

        var carole = await _run.NewPlayerAsync();
        var start = (await carole.JoinAsync(code)).Session;
        Assert.Null((await carole.AnswerAsync(start.SessionId, code, 1)).Session.Ghost);

        // Alice finit (perdue d'entrée) : à la réponse suivante de Carole, le fantôme est là.
        await alice.PlayAsync(aliceStart.SessionId, code, 1, false, false, false, false, false);
        Assert.Equal(new RunGhostResponse("Alice", 0, null), (await carole.AnswerAsync(start.SessionId, code, 2)).Session.Ghost);
    }

    [Fact]
    public async Task AuteurQuiAAbandonne_PasDeFantome()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var aliceStart = (await alice.LaunchAsync()).Session;
        await alice.AnswerAsync(aliceStart.SessionId, aliceStart.ChallengeCode, 1);
        await alice.AbandonRawAsync(aliceStart.SessionId);

        var bob = await _run.NewPlayerAsync("Bob");
        var start = (await bob.JoinAsync(aliceStart.ChallengeCode)).Session;
        Assert.Null((await bob.AnswerAsync(start.SessionId, aliceStart.ChallengeCode, 1)).Session.Ghost);
    }

    [Fact]
    public async Task LAmiQuiALanceLaPlaylist_SonTotalJusquAuMorceauRepondu_RienDAvance()
    {
        var (_, code) = await AliceLosesAtRoundTwoAsync();

        var bob = await _run.NewPlayerAsync("Bob");
        var bobStart = (await bob.JoinAsync(code)).Session;
        Assert.Null(bobStart.Ghost);

        var first = await bob.AnswerAsync(bobStart.SessionId, code, 1, artist: false, title: false);
        Assert.Equal(new RunGhostResponse("Alice", 100, null), first.Session.Ghost);

        var second = await bob.AnswerAsync(bobStart.SessionId, code, 2);
        Assert.Equal(new RunGhostResponse("Alice", 200, null), second.Session.Ghost);
        Assert.Equal(100, second.Session.TotalScore);

        // Relue, la partie rend le même fantôme (reprise).
        Assert.Equal(new RunGhostResponse("Alice", 200, null), (await bob.SessionAsync(bobStart.SessionId)).Ghost);
    }

    [Fact]
    public async Task AuteurEfface_PasDeFantome_LaPartieDeLAutreSeJoueNormalement()
    {
        var (alice, code) = await AliceLosesAtRoundTwoAsync();
        // Ce que fait l'effacement d'un joueur (piège 48) : ses parties, son record et son accès disparaissent, le défi reste, sans auteur.
        await _run.Api.ExecuteAsync($"""
            DELETE FROM runs.records WHERE player_id = '{alice.Id}';
            DELETE FROM runs.sessions WHERE player_id = '{alice.Id}';
            DELETE FROM runs.access WHERE player_id = '{alice.Id}';
            UPDATE runs.challenges SET created_by = NULL WHERE code = '{code}';
            """);

        var bob = await _run.NewPlayerAsync("Bob");
        var start = (await bob.JoinAsync(code)).Session;
        Assert.Null(start.Ghost);

        var first = await bob.AnswerAsync(start.SessionId, code, 1);
        Assert.Null(first.Session.Ghost);
        Assert.Equal(100, first.Session.TotalScore);
    }

    [Fact]
    public async Task UnMorceauRetireAuJoueur_NeCompteNiPourLuiNiPourLeFantome()
    {
        var (_, code) = await AliceLosesAtRoundTwoAsync();
        var bob = await _run.NewPlayerAsync("Bob");
        var bobStart = (await bob.JoinAsync(code)).Session;
        // Le morceau 2 (trouvé par Alice, 100 pts) n'a plus d'extrait quand Bob y arrive : il lui est retiré.
        await _run.RemovePreviewAsync(await _run.TrackAtAsync(code, 2));

        await bob.AnswerAsync(bobStart.SessionId, code, 1);
        var third = await bob.AnswerAsync(bobStart.SessionId, code, 3);

        Assert.Equal(new RunGhostResponse("Alice", 200, null), third.Session.Ghost);
    }

    [Fact]
    public async Task LeJoueurDepasseLAuteur_LaMancheOuSaPartieSestArretee_PuisRienALaFin()
    {
        var (_, code) = await AliceLosesAtRoundTwoAsync();
        var bob = await _run.NewPlayerAsync("Bob");
        var id = (await bob.JoinAsync(code)).Session.SessionId;

        await bob.PlayAsync(id, code, 1, AllFound);
        await bob.PlayAsync(id, code, 6, AllFound);
        var eleventh = await bob.AnswerAsync(id, code, 11);
        Assert.Equal(new RunGhostResponse("Alice", 300, 2), eleventh.Session.Ghost);

        // Partie finie : plus de fantôme (la comparaison prend le relais).
        var end = await bob.PlayAsync(id, code, 12, false, false, false, false);
        Assert.Equal("lost", end.Session.Status);
        Assert.Null(end.Session.Ghost);
    }
}
