using System.Net;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Le défi d'un ami reçu (<c>POST /api/runs/challenges/{code}/received</c>) : un compte qui ouvre la playlist d'un autre joueur la retrouve dans
/// <c>GET /api/runs/me</c> (« Léa t'a défié ») pendant 7 jours, sauf s'il l'a refusée ou jouée ; un invité, l'auteur lui-même et une playlist déjà jouée n'en créent pas.
/// </summary>
public class RunReceivedChallengeTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() => _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    /// <summary>Alice lance la playlist, trouve 3 morceaux (300 pts) puis perd à la manche 2 : sa partie est finie.</summary>
    private async Task<string> AliceFinishesAsync()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var start = (await alice.LaunchAsync()).Session;
        await alice.PlayAsync(start.SessionId, start.ChallengeCode, 1, true, true, true, false, false);
        await alice.PlayAsync(start.SessionId, start.ChallengeCode, 6, false, false, false, false, false);
        return start.ChallengeCode;
    }

    /// <summary>Vieillit le défi reçu sur l'horloge du jeu (simulée), pas sur celle de la base.</summary>
    private Task ReceivedDaysAgoAsync(Guid playerId, int days) =>
        _run.Api.ExecuteAsync($"UPDATE runs.received_challenges SET received_at = '{_run.Game.Time.GetUtcNow().AddDays(-days):O}' WHERE player_id = '{playerId}'");

    [Fact]
    public async Task CompteQuiOuvreLeLien_RetrouveLeDefiSurSonAccueil_AvecLeScoreAbattre()
    {
        var code = await AliceFinishesAsync();
        var bob = await _run.NewPlayerAsync("Bob");

        Assert.Null((await bob.MeAsync()).Received);
        Assert.Equal(HttpStatusCode.NoContent, (await bob.ReceiveRawAsync(code)).StatusCode);

        var received = (await bob.MeAsync()).Received;
        Assert.NotNull(received);
        Assert.Equal(code, received.Code);
        Assert.Equal("Alice", received.AuthorPseudo);
        Assert.Equal(300, received.ScoreToBeat);
    }

    [Fact]
    public async Task Recevoir_DeuxFois_NeCreeQuUneLigne()
    {
        var code = await AliceFinishesAsync();
        var bob = await _run.NewPlayerAsync("Bob");
        await bob.ReceiveRawAsync(code);
        Assert.Equal(HttpStatusCode.NoContent, (await bob.ReceiveRawAsync(code)).StatusCode);

        Assert.Equal(1, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.received_challenges WHERE player_id = '{bob.Id}'"));
    }

    [Fact]
    public async Task Invite_NeRecoitRien()
    {
        var code = await AliceFinishesAsync();
        var guest = await _run.NewPlayerAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await guest.ReceiveRawAsync(code)).StatusCode);
        Assert.Null((await guest.MeAsync()).Received);
    }

    [Fact]
    public async Task Auteur_NeSeDefiePasLuiMeme()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var code = (await alice.LaunchAsync()).Session.ChallengeCode;

        await alice.ReceiveRawAsync(code);
        Assert.Null((await alice.MeAsync()).Received);
    }

    [Fact]
    public async Task PlaylistDejaJouee_PasDeDefi()
    {
        var code = await AliceFinishesAsync();
        var bob = await _run.NewPlayerAsync("Bob");
        await bob.JoinAsync(code);

        await bob.ReceiveRawAsync(code);
        Assert.Null((await bob.MeAsync()).Received);
    }

    [Fact]
    public async Task DefiRecu_DisparaitQuandOnLaJoue()
    {
        var code = await AliceFinishesAsync();
        var bob = await _run.NewPlayerAsync("Bob");
        await bob.ReceiveRawAsync(code);
        Assert.NotNull((await bob.MeAsync()).Received);

        await bob.JoinAsync(code);
        Assert.Null((await bob.MeAsync()).Received);
    }

    [Fact]
    public async Task Refuser_RetireLeDefi_EtUneNouvelleOuvertureNeLeRamenePas()
    {
        var code = await AliceFinishesAsync();
        var bob = await _run.NewPlayerAsync("Bob");
        await bob.ReceiveRawAsync(code);

        Assert.Equal(HttpStatusCode.NoContent, (await bob.DismissRawAsync(code)).StatusCode);
        Assert.Null((await bob.MeAsync()).Received);

        await bob.ReceiveRawAsync(code);
        Assert.Null((await bob.MeAsync()).Received);
    }

    [Fact]
    public async Task DefiRecu_ExpireAuBoutDeSeptJours()
    {
        var code = await AliceFinishesAsync();
        var bob = await _run.NewPlayerAsync("Bob");
        await bob.ReceiveRawAsync(code);

        await ReceivedDaysAgoAsync(bob.Id, 6);
        Assert.NotNull((await bob.MeAsync()).Received);

        await ReceivedDaysAgoAsync(bob.Id, 8);
        Assert.Null((await bob.MeAsync()).Received);
    }

    [Fact]
    public async Task CodeInconnu_404_EtSansCookie_401()
    {
        var bob = await _run.NewPlayerAsync("Bob");
        var response = await bob.ReceiveRawAsync("ZZZZZZ");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var anonymous = _run.Api.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync("/api/runs/challenges/ZZZZZZ/received", null, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync("/api/runs/challenges/ZZZZZZ/received/dismiss", null, TestContext.Current.CancellationToken)).StatusCode);
    }
}
