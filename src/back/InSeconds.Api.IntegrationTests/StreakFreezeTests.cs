using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InSeconds.Api.Features.Players.GetCurrentPlayer;
using InSeconds.Api.Features.Sessions.GetTodaySession;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Features.Stats.Today;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests;

/// <summary>
/// Gel de série : consommation automatique d'un gel par jour manqué (comptes connectés),
/// gain tous les 7 jours (2 max), série effective exposée par le peek / players/me / stats,
/// incitation invité (LostStreak, FreezeMilestone).
/// </summary>
[Collection("Integration")]
public class StreakFreezeTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── Consommation / gain ─────────────────────────────────────────────────

    [Fact]
    public async Task Connecte_UnJourManqueEtUnGel_SerieProtegeePuisContinue()
    {
        var (client, playerId) = await CreatePlayerAsync(linked: true, streak: 12, lastPlayedDaysAgo: 2, freezes: 1);

        var peek = await PeekAsync(client);
        Assert.Equal("protected", peek.Streak.Status);
        Assert.Equal(12, peek.CurrentStreak);
        Assert.Equal(1, peek.Streak.MissedDays);
        Assert.Equal(1, peek.Streak.Freezes);

        await PlayFullGameAsync(client);

        var (streak, freezes) = await ReadPlayerAsync(playerId);
        Assert.Equal(13, streak);
        Assert.Equal(0, freezes);

        var stats = await client.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");
        Assert.Equal(1, stats!.FreezesUsed);
        Assert.False(stats.FreezeMilestone);
        Assert.Equal(13, stats.CurrentStreak);
    }

    [Fact]
    public async Task Connecte_WeekEndManqueAvecDeuxGels_SerieContinue()
    {
        var (client, playerId) = await CreatePlayerAsync(linked: true, streak: 5, lastPlayedDaysAgo: 3, freezes: 2);

        await PlayFullGameAsync(client);

        var (streak, freezes) = await ReadPlayerAsync(playerId);
        Assert.Equal(6, streak);
        Assert.Equal(0, freezes);
    }

    [Fact]
    public async Task Connecte_WeekEndManqueAvecUnSeulGel_SerieCasseeEtRepartA1()
    {
        var (client, playerId) = await CreatePlayerAsync(linked: true, streak: 5, lastPlayedDaysAgo: 3, freezes: 1);

        var peek = await PeekAsync(client);
        Assert.Equal("broken", peek.Streak.Status);
        Assert.Equal(0, peek.CurrentStreak);
        Assert.Null(peek.Streak.LostStreak); // réservé aux invités

        await PlayFullGameAsync(client);

        var (streak, freezes) = await ReadPlayerAsync(playerId);
        Assert.Equal(1, streak);
        Assert.Equal(1, freezes);
    }

    [Fact]
    public async Task Connecte_SeptiemeJour_GagneUnGel()
    {
        var (client, playerId) = await CreatePlayerAsync(linked: true, streak: 6, lastPlayedDaysAgo: 1, freezes: 1);

        await PlayFullGameAsync(client);

        var (streak, freezes) = await ReadPlayerAsync(playerId);
        Assert.Equal(7, streak);
        Assert.Equal(2, freezes);

        var stats = await client.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");
        Assert.True(stats!.FreezeMilestone);
    }

    [Fact]
    public async Task Connecte_SeptiemeJourAvecStockPlein_NeDepassePasLeMaximum()
    {
        var (client, playerId) = await CreatePlayerAsync(linked: true, streak: 13, lastPlayedDaysAgo: 1, freezes: 2);

        await PlayFullGameAsync(client);

        var (streak, freezes) = await ReadPlayerAsync(playerId);
        Assert.Equal(14, streak);
        Assert.Equal(2, freezes);

        var stats = await client.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");
        Assert.False(stats!.FreezeMilestone);
    }

    [Fact]
    public async Task Connecte_RegagneUnGelApresDejaAvoirAtteintLePlafond_PasDeNotification()
    {
        // Le joueur a déjà eu 2 gels par le passé (a consommé un gel depuis, stock=1) : en
        // regagnant un gel sur un nouveau multiple de 7 jours, le stock remonte bien à 2
        // (regain réel), mais « +1 gel gagné ! » ne doit plus se déclencher — cf. capture
        // d'écran signalée par l'utilisateur, gel de série #162 follow-up.
        var (client, playerId) = await CreatePlayerAsync(
            linked: true, streak: 27, lastPlayedDaysAgo: 1, freezes: 1, hasReachedMaxFreezes: true);

        await PlayFullGameAsync(client);

        var (streak, freezes) = await ReadPlayerAsync(playerId);
        Assert.Equal(28, streak);
        Assert.Equal(2, freezes);

        var stats = await client.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");
        Assert.False(stats!.FreezeMilestone);
    }

    // ── Invités ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Invite_JourManque_NUtiliseJamaisDeGel()
    {
        var (client, playerId) = await CreatePlayerAsync(linked: false, streak: 5, lastPlayedDaysAgo: 2, freezes: 0);

        await PlayFullGameAsync(client);

        var (streak, freezes) = await ReadPlayerAsync(playerId);
        Assert.Equal(1, streak);
        Assert.Equal(0, freezes);
    }

    [Fact]
    public async Task Invite_SeptiemeJour_FreezeMilestoneSansGel()
    {
        var (client, playerId) = await CreatePlayerAsync(linked: false, streak: 6, lastPlayedDaysAgo: 1, freezes: 0);

        await PlayFullGameAsync(client);

        var (streak, freezes) = await ReadPlayerAsync(playerId);
        Assert.Equal(7, streak);
        Assert.Equal(0, freezes);

        var stats = await client.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");
        Assert.True(stats!.FreezeMilestone);
        Assert.Equal(0, stats.FreezesUsed);
    }

    [Fact]
    public async Task Invite_SeriePerdueAuDessusDuSeuil_PeekRetourneLostStreak()
    {
        var (client, _) = await CreatePlayerAsync(linked: false, streak: 6, lastPlayedDaysAgo: 3, freezes: 0);

        var peek = await PeekAsync(client);

        Assert.Equal("broken", peek.Streak.Status);
        Assert.Equal(0, peek.CurrentStreak);
        Assert.Equal(6, peek.Streak.LostStreak);
    }

    [Fact]
    public async Task Invite_SeriePerdueSousLeSeuil_PasDeLostStreak()
    {
        var (client, _) = await CreatePlayerAsync(linked: false, streak: 1, lastPlayedDaysAgo: 3, freezes: 0);

        var peek = await PeekAsync(client);

        Assert.Equal("broken", peek.Streak.Status);
        Assert.Null(peek.Streak.LostStreak);
    }

    // ── Exposition ──────────────────────────────────────────────────────────

    [Fact]
    public async Task PlayersMe_Connecte_ExposeGelsEtProchainGel()
    {
        var (client, _) = await CreatePlayerAsync(linked: true, streak: 12, lastPlayedDaysAgo: 1, freezes: 2);

        var me = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me?peek=true");

        Assert.Equal(12, me!.CurrentStreak);
        Assert.Equal("active", me.Streak.Status);
        Assert.Equal(2, me.Streak.Freezes);
        Assert.Equal(2, me.Streak.MaxFreezes);
        Assert.Equal(2, me.Streak.NextFreezeInDays);
    }

    [Fact]
    public async Task PlayersMe_SerieFigeeMaisCassee_RetourneSerieEffectiveZero()
    {
        // Bug corrigé : CurrentStreak stocké n'est recalculé qu'à la complétion — sans série
        // effective, une série cassée restait affichée tant que le joueur ne rejouait pas.
        var (client, _) = await CreatePlayerAsync(linked: false, streak: 9, lastPlayedDaysAgo: 5, freezes: 0);

        var me = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me?peek=true");

        Assert.Equal(0, me!.CurrentStreak);
    }

    [Fact]
    public async Task E2ESetStreak_PoseLEtatDeSerie()
    {
        var client = factory.CreateClient();
        var me = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me");

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/e2e/set-streak")
        {
            Content = JsonContent.Create(new { PlayerId = me!.PlayerId, Streak = 4, LastPlayedDaysAgo = 1, Freezes = 0 }),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "admin-token");
        var resp = await factory.Client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var (streak, _) = await ReadPlayerAsync(me.PlayerId);
        Assert.Equal(4, streak);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private async Task<(HttpClient Client, Guid PlayerId)> CreatePlayerAsync(
        bool linked, int streak, int lastPlayedDaysAgo, int freezes, bool hasReachedMaxFreezes = false)
    {
        var client = factory.CreateClient();
        // Crée le Player (guest) et pose son cookie sur ce client.
        var me = await client.GetFromJsonAsync<GetCurrentPlayerResponse>("/api/players/me");

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var player = await db.Players.FirstAsync(p => p.Id == me!.PlayerId);
        if (linked)
            player.LinkToAccount($"{Guid.NewGuid():N}@example.com", $"P{Random.Shared.Next(10_000, 99_999)}");
        player.RestoreStreakForTesting(streak, Today.AddDays(-lastPlayedDaysAgo), freezes, hasReachedMaxFreezes);
        await db.SaveChangesAsync();

        return (client, me!.PlayerId);
    }

    private static async Task<GetTodaySessionResponse> PeekAsync(HttpClient client)
        => (await client.GetFromJsonAsync<GetTodaySessionResponse>("/api/sessions/today"))!;

    private static async Task PlayFullGameAsync(HttpClient client)
    {
        var start = await client.PostAsync("/api/sessions", null);
        start.EnsureSuccessStatusCode();
        var session = (await start.Content.ReadFromJsonAsync<StartSessionResponse>())!;

        foreach (var track in session.Tracks)
        {
            var resp = await client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
                new SubmitAnswerBody(track.Id, 1m, false, "X", null));
            resp.EnsureSuccessStatusCode();
        }
    }

    private async Task<(int Streak, int Freezes)> ReadPlayerAsync(Guid playerId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var player = await db.Players.AsNoTracking().FirstAsync(p => p.Id == playerId);
        return (player.CurrentStreak, player.StreakFreezes);
    }
}
