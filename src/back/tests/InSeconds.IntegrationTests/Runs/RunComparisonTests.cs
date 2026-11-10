using System.Net;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// La comparaison des joueurs d'une playlist (<c>GET /api/runs/challenges/{code}/comparison</c>) : fermée tant qu'on n'a pas fini sa propre partie,
/// puis une ligne par partie terminée (gagnée ou perdue), triée par total, avec le score de chaque manche (vide si non jouée). Des scores seulement,
/// jamais un morceau (piège 31).
/// </summary>
public class RunComparisonTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private static readonly bool[] AllFound = [true, true, true, true, true];
    private static readonly bool[] NoneFound = [false, false, false, false, false];

    [Fact]
    public async Task Verrouillee_TantQueSaPropreParties_NEstPasFinie_PasDIdentite_OuCodeInconnu()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var code = start.Session.ChallengeCode;
        var friend = await _run.NewPlayerAsync();

        // Pas encore jouée : le lien montre « none », la comparaison reste fermée.
        await GameAsserts.ProblemAsync(await friend.ComparisonRawAsync(code), HttpStatusCode.Conflict, RunsErrorCodes.ComparisonLocked);
        // En cours : fermée aussi, y compris pour l'auteur.
        await GameAsserts.ProblemAsync(await alice.ComparisonRawAsync(code), HttpStatusCode.Conflict, RunsErrorCodes.ComparisonLocked);
        await GameAsserts.ProblemAsync(await alice.ComparisonRawAsync("ZZZZZZ"), HttpStatusCode.NotFound, RunsErrorCodes.ChallengeNotFound);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _run.Api.CreateClient().GetAsync($"/api/runs/challenges/{code}/comparison", Ct)).StatusCode);

        await alice.PlayAsync(start.Session.SessionId, code, 1, AllFound);
        await GameAsserts.ProblemAsync(await alice.ComparisonRawAsync(code), HttpStatusCode.Conflict, RunsErrorCodes.ComparisonLocked);
    }

    [Fact]
    public async Task APlusieursJoueurs_TrieeParTotal_ManchesNonJoueesVides_ToiEtInvite()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var code = start.Session.ChallengeCode;

        // Alice gagne les 4 manches.
        await alice.PlayAsync(start.Session.SessionId, code, 1, [.. AllFound, .. AllFound, .. AllFound, .. AllFound]);

        // Un invité passe la manche 1, puis rate la 2 : partie perdue, manches 3 et 4 jamais jouées.
        var guest = await _run.NewPlayerAsync();
        var joined = await guest.JoinAsync(code);
        await guest.PlayAsync(joined.Session.SessionId, code, 1, [.. AllFound, .. NoneFound]);

        // Un compte abandonne, un autre joueur est encore en cours : ni l'un ni l'autre n'est dans le tableau.
        var carol = await _run.NewPlayerAsync("Carol");
        var carolSession = await carol.JoinAsync(code);
        await carol.AbandonRawAsync(carolSession.Session.SessionId);
        var dave = await _run.NewPlayerAsync("Dave");
        await dave.JoinAsync(code);

        var forAlice = await alice.ComparisonAsync(code.ToLowerInvariant());
        Assert.Equal((code, "Alice", 2, 4), (forAlice.Code, forAlice.AuthorPseudo, forAlice.PlayerCount, forAlice.RoundCount));

        var (first, second) = (forAlice.Rows[0], forAlice.Rows[1]);
        Assert.Equal(("Alice", "runs.discs.gold", true), (first.Pseudo, first.Disc.Key, first.IsMe));
        Assert.All(first.Rounds, score => Assert.NotNull(score));
        Assert.Equal(first.Rounds.Sum(), first.TotalScore);

        Assert.Null(second.Pseudo);
        Assert.Equal(("runs.discs.wax", false), (second.Disc.Key, second.IsMe));
        Assert.NotNull(second.Rounds[0]);
        Assert.Equal(0, second.Rounds[1]);
        Assert.Equal(new int?[] { null, null }, second.Rounds.Skip(2).ToArray());
        Assert.True(first.TotalScore > second.TotalScore);
        Assert.Equal(second.Rounds[0], second.TotalScore);

        // Le même tableau vu par l'invité : « Toi » change de ligne ; un abandon peut lui aussi comparer.
        var forGuest = await guest.ComparisonAsync(code);
        Assert.Equal(new[] { false, true }, forGuest.Rows.Select(r => r.IsMe).ToArray());
        Assert.Equal(2, (await carol.ComparisonAsync(code)).PlayerCount);
    }

    [Fact]
    public async Task EgaliteDeTotal_PlusDeManchesPassees_PuisLaPremiereTerminee()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var code = start.Session.ChallengeCode;
        await alice.PlayAsync(start.Session.SessionId, code, 1, NoneFound);

        var bob = await _run.NewPlayerAsync("Bob");
        var joined = await bob.JoinAsync(code);
        await bob.PlayAsync(joined.Session.SessionId, code, 1, NoneFound);

        var rows = (await bob.ComparisonAsync(code)).Rows;
        Assert.Equal(new[] { "Alice", "Bob" }, rows.Select(r => r.Pseudo).ToArray());
        Assert.All(rows, row => Assert.Equal((0, "runs.discs.scratched"), (row.TotalScore, row.Disc.Key)));
    }

    [Fact]
    public async Task DeuxJoueursDeMemePseudo_ReçoiventUnRepereDistinct_LesAutresAucun()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = await alice.LaunchAsync();
        var code = start.Session.ChallengeCode;
        await alice.PlayAsync(start.Session.SessionId, code, 1, NoneFound);

        // Deux invités se sont donné le même pseudo (aucune unicité entre invités, sans tenir compte de la casse).
        var lea1 = await _run.NewPlayerAsync();
        var lea2 = await _run.NewPlayerAsync();
        await _run.Api.ExecuteAsync($"UPDATE players.players SET guest_pseudo = 'Léa' WHERE id = '{lea1.Id}'");
        await _run.Api.ExecuteAsync($"UPDATE players.players SET guest_pseudo = 'léa' WHERE id = '{lea2.Id}'");
        foreach (var lea in new[] { lea1, lea2 })
        {
            var joined = await lea.JoinAsync(code);
            await lea.PlayAsync(joined.Session.SessionId, code, 1, NoneFound);
        }

        var rows = (await alice.ComparisonAsync(code)).Rows;

        var leas = rows.Where(r => r.Pseudo is "Léa" or "léa").ToList();
        Assert.Equal(2, leas.Count);
        Assert.All(leas, row => Assert.False(string.IsNullOrEmpty(row.Tag)));
        Assert.NotEqual(leas[0].Tag, leas[1].Tag);
        // Le repère ne dépend que de l'identifiant du joueur : le même à chaque lecture, et absent pour qui n'a pas d'homonyme.
        Assert.Equal(leas.Select(r => r.Tag), (await lea1.ComparisonAsync(code)).Rows.Where(r => r.Pseudo is "Léa" or "léa").Select(r => r.Tag));
        Assert.Null(rows.Single(r => r.Pseudo == "Alice").Tag);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
