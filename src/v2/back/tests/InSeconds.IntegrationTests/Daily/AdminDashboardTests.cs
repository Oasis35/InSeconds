using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Daily.Application;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>Le tableau de bord de l'admin (F1, v1 : <c>GET /api/admin/stats</c>) : activité, joueurs, jours disponibles et chiffres d'un jour.</summary>
public class AdminDashboardTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/api/admin/daily/dashboard";

    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private async Task<DashboardResponse> ReadAsync(string query = "")
    {
        var response = await _game.App.Admin().GetAsync(Route + query, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<DashboardResponse>(Ct))!;
    }

    private static string Day(DateOnly day) => $"?date={day:yyyy-MM-dd}";

    [Fact]
    public async Task Activite_TrenteJoursJusquAAujourdhui_LesJoursSansPartieAZero()
    {
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today.AddDays(-3), 1, 2, 3, 4, 5);
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        await _game.AddSessionAsync(alice.Id, Today, 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(bob.Id, Today, 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-3), 1, (1m, true, true, false, 850));
        // Une partie abandonnée n'est pas de l'activité terminée.
        await _game.AddSessionAsync(bob.Id, Today.AddDays(-3), 2, (1m, true, true, false, 850));

        var dashboard = await ReadAsync();

        Assert.Equal(30, dashboard.DailyActivity.Count);
        Assert.Equal((Today.AddDays(-29), Today), (dashboard.DailyActivity[0].Date, dashboard.DailyActivity[^1].Date));
        Assert.Equal(2, dashboard.DailyActivity.Single(d => d.Date == Today).PlayerCount);
        Assert.Equal(1, dashboard.DailyActivity.Single(d => d.Date == Today.AddDays(-3)).PlayerCount);
        Assert.Equal(1 + 2, dashboard.DailyActivity.Sum(d => d.PlayerCount));
    }

    [Fact]
    public async Task UnJourAvantLaFenetre_NeComptePasDansLActivite_MaisResteDisponible()
    {
        await _game.App.AddChallengeAsync(Today.AddDays(-40), 1, 2, 3, 4, 5);
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.AddSessionAsync(alice.Id, Today.AddDays(-40), 1, (1m, true, true, false, 850));

        var dashboard = await ReadAsync();

        Assert.Equal(0, dashboard.DailyActivity.Sum(d => d.PlayerCount));
        Assert.Equal([Today.AddDays(-40)], dashboard.AvailableDates);
    }

    [Fact]
    public async Task JoursDisponibles_LesJoursQuiOntUnDefi_DuPlusRecentAuPlusAncien()
    {
        await _game.App.AddChallengeAsync(Today.AddDays(-2), 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        await _game.App.AddChallengeAsync(Today.AddDays(-9), 1, 2, 3, 4, 5);

        Assert.Equal([Today, Today.AddDays(-2), Today.AddDays(-9)], (await ReadAsync()).AvailableDates);
    }

    [Fact]
    public async Task ChiffresDuJour_ParDefautAujourdhui_TerminesAbandonsExpiresEnCours()
    {
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        var players = new[] { await _game.NewPlayerAsync("A"), await _game.NewPlayerAsync("B"), await _game.NewPlayerAsync("C"), await _game.NewPlayerAsync("D") };
        await _game.AddSessionAsync(players[0].Id, Today, 1, (1m, true, true, false, 1000));
        await _game.AddSessionAsync(players[1].Id, Today, 2, (1m, true, true, false, 500));
        await _game.AddSessionAsync(players[2].Id, Today, 3, (1m, true, true, false, 500));
        await _game.AddSessionAsync(players[3].Id, Today, 0, (1m, true, true, false, 500));

        var kpis = (await ReadAsync()).SelectedDayKpis!;

        Assert.Equal(Today, kpis.Date);
        Assert.Equal((1, 1, 1, 1, 4, 25.0, 1000.0), (kpis.CompletedCount, kpis.AbandonedCount, kpis.ExpiredCount, kpis.PendingCount, kpis.TotalSessions, kpis.CompletionRate, kpis.MedianScore));
    }

    [Fact]
    public async Task ChiffresDUnJourPasse_LesPartiesEnCoursSontDesExpirees()
    {
        var day = Today.AddDays(-4);
        await _game.App.AddChallengeAsync(day, 1, 2, 3, 4, 5);
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        await _game.AddSessionAsync(alice.Id, day, 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(bob.Id, day, 0, (1m, true, true, false, 850));

        var kpis = (await ReadAsync(Day(day))).SelectedDayKpis!;

        Assert.Equal((1, 0, 1, 0, 2, 50.0), (kpis.CompletedCount, kpis.AbandonedCount, kpis.ExpiredCount, kpis.PendingCount, kpis.TotalSessions, kpis.CompletionRate));
    }

    [Fact]
    public async Task UnJourSansDefi_PasDeChiffres_200()
    {
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);

        Assert.Null((await ReadAsync(Day(Today.AddDays(-1)))).SelectedDayKpis);
    }

    [Fact]
    public async Task SansDefiDuTout_LeTableauDeBordSeLitQuandMeme()
    {
        var dashboard = await ReadAsync();

        Assert.Null(dashboard.SelectedDayKpis);
        Assert.Empty(dashboard.AvailableDates);
        Assert.Equal(30, dashboard.DailyActivity.Count);
    }

    [Fact]
    public async Task UnJoueurSupprime_DisparaitDeLActiviteEtDesChiffres()
    {
        await _game.App.AddChallengeAsync(Today, 1, 2, 3, 4, 5);
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        await _game.AddSessionAsync(alice.Id, Today, 1, (1m, true, true, false, 850));
        await _game.AddSessionAsync(bob.Id, Today, 1, (1m, true, true, false, 850));
        await _game.DeletePlayerAsync(bob.Id);

        var dashboard = await ReadAsync();

        Assert.Equal(1, dashboard.DailyActivity.Single(d => d.Date == Today).PlayerCount);
        Assert.Equal(1, dashboard.SelectedDayKpis!.TotalSessions);
    }

    [Fact]
    public async Task Joueurs_InvitesComptesEtActifs_LesSupprimesNeComptentPas()
    {
        var now = Start;
        var guestRecent = await _game.NewPlayerAsync();
        var guestOld = await _game.NewPlayerAsync();
        var accountRecent = await _game.NewPlayerAsync("Recent");
        var accountMonth = await _game.NewPlayerAsync("Month");
        await _game.NewPlayerAsync("Never");
        var deleted = await _game.NewPlayerAsync("Gone");
        await SetLastSeenAsync(guestRecent.Id, now.AddDays(-1));
        await SetLastSeenAsync(guestOld.Id, now.AddDays(-90));
        await SetLastSeenAsync(accountRecent.Id, now.AddDays(-6));
        await SetLastSeenAsync(accountMonth.Id, now.AddDays(-20));
        await SetLastSeenAsync(deleted.Id, now);
        await _game.DeletePlayerAsync(deleted.Id);

        var breakdown = (await ReadAsync()).PlayerBreakdown;

        // Actifs sur 7 jours : l'invité d'hier et le compte d'il y a 6 jours ; sur 30 jours : plus le compte d'il y a 20 jours.
        Assert.Equal((2, 3, 2, 3), (breakdown.TotalGuests, breakdown.TotalRegistered, breakdown.ActiveLast7Days, breakdown.ActiveLast30Days));
    }

    [Fact]
    public async Task DateInvalide_400_CodeStable()
    {
        await GameAsserts.ProblemAsync(await _game.App.Admin().GetAsync(Route + "?date=hier", Ct), HttpStatusCode.BadRequest, "admin.invalid_date");
        await GameAsserts.ProblemAsync(await _game.App.Admin().GetAsync(Route + "?date=2026-9-1", Ct), HttpStatusCode.BadRequest, "admin.invalid_date");
    }

    [Fact]
    public async Task ReserveAUnAdmin_401Et403()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync(Route, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _game.Api.CreateClient(TestUser.Player).GetAsync(Route, Ct)).StatusCode);
    }

    private Task SetLastSeenAsync(Guid playerId, DateTimeOffset at) =>
        _game.Api.ExecuteAsync($"UPDATE players.players SET last_seen_at = '{at:yyyy-MM-dd HH:mm:ss}+00' WHERE id = '{playerId}'");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
