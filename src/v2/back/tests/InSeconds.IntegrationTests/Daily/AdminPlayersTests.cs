using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// L'onglet Joueurs de l'admin (F1, v1 : <c>GET /api/admin/players</c> et <c>GET /api/admin/players/{id}/history</c>) : les comptes inscrits avec leur
/// série effective, et l'historique des 30 derniers jours d'un joueur.
/// </summary>
public class AdminPlayersTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string ListRoute = "/api/admin/players";

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<IReadOnlyList<AdminPlayer>> ListAsync()
    {
        var response = await _game.App.Admin().GetAsync(ListRoute, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AdminPlayersResponse>(Ct))!.Players;
    }

    private Task SetLastSeenAsync(Guid playerId, DateTimeOffset? at) =>
        _game.Api.ExecuteAsync($"UPDATE players.players SET last_seen_at = {(at is { } d ? $"'{d:yyyy-MM-dd HH:mm:ss}+00'" : "NULL")} WHERE id = '{playerId}'");

    private string HistoryRoute(Guid playerId) => $"/api/admin/daily/players/{playerId}/history";

    private async Task<IReadOnlyList<AdminPlayerGame>> HistoryAsync(Guid playerId)
    {
        var response = await _game.App.Admin().GetAsync(HistoryRoute(playerId), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AdminPlayerHistoryResponse>(Ct))!.Games;
    }

    // --- la liste des comptes ---

    [Fact]
    public async Task LesComptesSeulement_LesInvitesEtLesSupprimesNeFigurentPas()
    {
        await _game.NewPlayerAsync();
        var alice = await _game.NewPlayerAsync("Alice");
        var gone = await _game.NewPlayerAsync("Gone");
        await _game.DeletePlayerAsync(gone.Id);

        var players = await ListAsync();

        var only = Assert.Single(players);
        Assert.Equal((alice.Id, "Alice", "alice@example.com", false), (only.Id, only.Pseudo, only.Email, only.IsAdmin));
    }

    [Fact]
    public async Task LesPlusRecemmentVusDAbord_JamaisVusEnDernier()
    {
        var never = await _game.NewPlayerAsync("Never");
        var old = await _game.NewPlayerAsync("Old");
        var recent = await _game.NewPlayerAsync("Recent");
        await SetLastSeenAsync(never.Id, null);
        await SetLastSeenAsync(old.Id, Start.AddDays(-10));
        await SetLastSeenAsync(recent.Id, Start.AddHours(-1));

        Assert.Equal(["Recent", "Old", "Never"], (await ListAsync()).Select(p => p.Pseudo));
    }

    [Fact]
    public async Task LeRoleAdmin_EstMontre()
    {
        var boss = await _game.NewPlayerAsync("Boss");
        await _game.Api.ExecuteAsync($"UPDATE players.accounts SET is_admin = true WHERE player_id = '{boss.Id}'");

        Assert.True(Assert.Single(await ListAsync()).IsAdmin);
    }

    [Fact]
    public async Task PartiesJouees_SeulesLesPartiesTermineesComptent()
    {
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today.AddDays(-2), 1, 2, 3, 4, 5);
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.AddSessionAsync(alice.Id, Today, 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-1), 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-2), 2, (1m, true, true, false, 850));

        Assert.Equal(2, Assert.Single(await ListAsync()).GamesPlayed);
    }

    [Fact]
    public async Task SerieEffective_ActiveProtegeeCasseeOuAbsente()
    {
        var active = await _game.NewPlayerAsync("Active");
        var protectedPlayer = await _game.NewPlayerAsync("Protected");
        var broken = await _game.NewPlayerAsync("Broken");
        await _game.NewPlayerAsync("Nothing");
        await _game.SetStreakAsync(active.Id, 7, Today.AddDays(-1), 1);
        // Deux jours manqués (le 3 et le 4), couverts par les deux gels : la série tient, et il n'en reste aucun.
        await _game.SetStreakAsync(protectedPlayer.Id, 5, Today.AddDays(-3), 2);
        // Série de 9 restée figée au 20 septembre : cassée, la valeur stockée ne doit pas s'afficher.
        await _game.SetStreakAsync(broken.Id, 9, Today.AddDays(-15), 1);

        var byPseudo = (await ListAsync()).ToDictionary(p => p.Pseudo);

        Assert.Equal((7, 1, false), (byPseudo["Active"].CurrentStreak, byPseudo["Active"].StreakFreezes, byPseudo["Active"].StreakProtected));
        Assert.Equal((5, 0, true), (byPseudo["Protected"].CurrentStreak, byPseudo["Protected"].StreakFreezes, byPseudo["Protected"].StreakProtected));
        Assert.Equal((0, 1, false), (byPseudo["Broken"].CurrentStreak, byPseudo["Broken"].StreakFreezes, byPseudo["Broken"].StreakProtected));
        Assert.Equal((0, 0, false), (byPseudo["Nothing"].CurrentStreak, byPseudo["Nothing"].StreakFreezes, byPseudo["Nothing"].StreakProtected));
    }

    [Fact]
    public async Task LaDerniereVisite_EstCelleDuJoueur()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await SetLastSeenAsync(alice.Id, Start.AddHours(-3));

        Assert.Equal(Start.AddHours(-3), Assert.Single(await ListAsync()).LastSeenAt);
    }

    [Fact]
    public async Task Liste_ReserveeAUnAdmin_401Et403()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync(ListRoute, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _game.Api.CreateClient(TestUser.Player).GetAsync(ListRoute, Ct)).StatusCode);
    }

    // --- l'historique d'un joueur ---

    [Fact]
    public async Task Historique_TrenteJours_LaPlusRecenteDAbord_ScoreSeulementSiTerminee()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today.AddDays(-2), 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today.AddDays(-29), 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today.AddDays(-30), 1, 2, 3, 4, 5);
        await _game.AddSessionAsync(alice.Id, Today, 0, (1m, true, true, false, 850));
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-1), 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-2), 2, (1m, true, true, false, 850));
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-29), 3, (1m, true, true, false, 850));
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-30), 1, (1m, true, true, false, 850));

        var games = await HistoryAsync(alice.Id);

        // Le trentième jour (aujourd'hui compris) est le dernier montré : il y a 29 jours, pas 30.
        Assert.Equal(
            [(Today, "Pending", (int?)null), (Today.AddDays(-1), "Completed", 850), (Today.AddDays(-2), "Abandoned", null), (Today.AddDays(-29), "Expired", null)],
            games.Select(g => (g.Date, g.Status, g.Score)));
    }

    [Fact]
    public async Task Historique_UneAncienneEnCours_EstDonneeExpiree()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.App.AddChallengeAsync(Today.AddDays(-6), 1, 2, 3, 4, 5);
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-6), 0, (1m, true, true, false, 850));

        var game = Assert.Single(await HistoryAsync(alice.Id));

        Assert.Equal(("Expired", (int?)null), (game.Status, game.Score));
    }

    [Fact]
    public async Task Historique_LesGelsConsommesEtGagnes()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.App.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-1), 1, (1m, true, true, false, 850));
        await _game.Api.ExecuteAsync($"UPDATE daily.sessions SET freezes_used = 2, freeze_earned = true WHERE player_id = '{alice.Id}'");

        var game = Assert.Single(await HistoryAsync(alice.Id));

        Assert.Equal((2, true), (game.FreezesUsed, game.FreezeEarned));
    }

    [Fact]
    public async Task Historique_UnJoueurSansPartie_ListeVide()
    {
        Assert.Empty(await HistoryAsync((await _game.NewPlayerAsync("Alice")).Id));
    }

    [Fact]
    public async Task Historique_UnInviteSeLitAussi()
    {
        var guest = await _game.NewPlayerAsync();
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        await _game.AddSessionAsync(guest.Id, Today, 1, (1m, true, true, false, 850));

        Assert.Single(await HistoryAsync(guest.Id));
    }

    [Fact]
    public async Task Historique_JoueurInconnuOuSupprime_404()
    {
        await GameAsserts.ProblemAsync(await _game.App.Admin().GetAsync(HistoryRoute(Guid.NewGuid()), Ct), HttpStatusCode.NotFound, "common.not_found");

        var gone = await _game.NewPlayerAsync("Gone");
        await _game.DeletePlayerAsync(gone.Id);
        await GameAsserts.ProblemAsync(await _game.App.Admin().GetAsync(HistoryRoute(gone.Id), Ct), HttpStatusCode.NotFound, "common.not_found");
    }

    [Fact]
    public async Task Historique_ReserveAUnAdmin_401Et403()
    {
        var route = HistoryRoute((await _game.NewPlayerAsync("Alice")).Id);

        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync(route, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _game.Api.CreateClient(TestUser.Player).GetAsync(route, Ct)).StatusCode);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
