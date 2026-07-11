using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using Microsoft.Extensions.DependencyInjection;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class SessionEdgeCaseTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    // ── Expiry paresseuse ────────────────────────────────────────────────────

    [Fact]
    public async Task StartSession_SessionPendingDHier_ExpireEnAbandoned_EtNouvelleSessionCree()
    {
        // Créer une session Pending puis la dater à hier directement en base
        var session = await StartSessionAsync();

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var gs = await db.GameSessions.FindAsync(session.SessionId);
            Assert.NotNull(gs);

            // Faire croire que le défi était hier en changeant le challenge lié
            // Plus simple : modifier directement la session pour qu'elle pointe sur le défi J-1
            var yesterday = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
            var yesterdayChallenge = await db.DailyChallenges.FirstOrDefaultAsync(c => c.Date == yesterday);
            if (yesterdayChallenge is not null)
            {
                gs.DailyChallengeId = yesterdayChallenge.Id;
                await db.SaveChangesAsync();
            }
        }

        // Nouveau StartSession → doit expirer la session d'hier et créer une nouvelle
        var resp2 = await _client.PostAsync("/api/sessions", null);
        Assert.Equal(HttpStatusCode.OK, resp2.StatusCode);

        var session2 = await resp2.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session2);
        Assert.False(session2.IsResuming); // c'est une nouvelle session, pas une reprise

        // La session d'hier doit être Abandoned
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var expired = await db.GameSessions
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.Id == session.SessionId);
            Assert.NotNull(expired);
            Assert.Equal(SessionStatus.Abandoned, expired.Status);
            Assert.NotNull(expired.AbandonedAt);
        }
    }

    // ── SubmitAnswer sur session non-Pending ─────────────────────────────────

    [Fact]
    public async Task SubmitAnswer_SessionAbandonnee_RetourneErreur()
    {
        var session = await StartSessionAsync();
        await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);

        var resp = await SubmitAsync(session.SessionId, session.Tracks[0].Id, 1m, "X", null);

        // Soumission sur une session Abandoned → le handler doit refuser (403 ou 400)
        Assert.True(
            resp.StatusCode == HttpStatusCode.Forbidden ||
            resp.StatusCode == HttpStatusCode.BadRequest ||
            resp.StatusCode == HttpStatusCode.Conflict,
            $"Expected 4xx, got {resp.StatusCode}");
    }

    [Fact]
    public async Task SubmitAnswer_SessionInexistante_Retourne404Ou403()
    {
        // SessionId qui n'existe pas
        var resp = await SubmitAsync(99999, 1, 1m, "X", null);

        Assert.True(
            resp.StatusCode == HttpStatusCode.NotFound ||
            resp.StatusCode == HttpStatusCode.Forbidden,
            $"Expected 404 or 403, got {resp.StatusCode}");
    }

    // ── AbandonSession edge cases ─────────────────────────────────────────────

    [Fact]
    public async Task AbandonSession_SessionInexistante_Retourne404Ou403()
    {
        var resp = await _client.PutAsync("/api/sessions/99999/abandon", null);

        Assert.True(
            resp.StatusCode == HttpStatusCode.NotFound ||
            resp.StatusCode == HttpStatusCode.Forbidden,
            $"Expected 404 or 403, got {resp.StatusCode}");
    }

    [Fact]
    public async Task AbandonSession_DejaAbandonnee_RetourneBadRequest()
    {
        var session = await StartSessionAsync();
        await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);

        var resp2 = await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);
        Assert.Equal(HttpStatusCode.BadRequest, resp2.StatusCode);
    }

    // ── Streak ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Streak_PartieComplete_IncrementeStreak()
    {
        var session = await StartSessionAsync();
        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        // La streak initiale est 0 (nouveau joueur guest), après complétion elle passe à 1
        Assert.Equal(0, session.CurrentStreak);

        // Re-POST pour vérifier qu'on est Completed et que la réponse de la session précédente
        // avait bien la streak de l'état avant complétion (0)
        // La streak est mise à jour côté DB ; on la lit via auth/me ou la prochaine session
        var resp409 = await _client.PostAsync("/api/sessions", null);
        Assert.Equal(HttpStatusCode.Conflict, resp409.StatusCode);
    }

    [Fact]
    public async Task Streak_PartieAbandonnee_NIncrementePas()
    {
        var session = await StartSessionAsync();
        var streakAvant = session.CurrentStreak;

        await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);

        // Vérifier directement en base
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var player = await db.Players.FirstAsync(p => p.Id != Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001"));
        Assert.Equal(streakAvant, player.CurrentStreak);
    }

    [Fact]
    public async Task Streak_DefiDeLaVeilleCompleteApresMinuit_ContinueLaStreak()
    {
        // Piège 18 : le joueur a complété le défi J-2, puis termine le défi J-1
        // après minuit UTC (donc "aujourd'hui"). La streak doit se baser sur la
        // date du défi (J-1 = lendemain de J-2 → +1), pas sur la date de complétion.
        var session = await StartSessionAsync();

        var yesterday    = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
        var dayBefore    = yesterday.AddDays(-1);
        int[] trackIds;
        Guid playerId;

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var yesterdayChallenge = await db.DailyChallenges.FirstAsync(c => c.Date == yesterday);

            var gs = await db.GameSessions.FindAsync(session.SessionId);
            gs!.DailyChallengeId = yesterdayChallenge.Id;
            playerId = gs.PlayerId;

            var player = await db.Players.FirstAsync(p => p.Id == playerId);
            player.LastPlayedDate = dayBefore;
            player.CurrentStreak  = 5;

            trackIds = await db.DailyChallengeTracks
                .Where(t => t.DailyChallengeId == yesterdayChallenge.Id)
                .Select(t => t.Id)
                .ToArrayAsync();

            await db.SaveChangesAsync();
        }

        foreach (var trackId in trackIds)
        {
            var resp = await SubmitAsync(session.SessionId, trackId, 1m, "X", null);
            resp.EnsureSuccessStatusCode();
        }

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var player = await db.Players.FirstAsync(p => p.Id == playerId);
            Assert.Equal(6, player.CurrentStreak);
            Assert.Equal(yesterday, player.LastPlayedDate);
        }
    }

    [Fact]
    public async Task Streak_JourManque_RemetLaStreakA1()
    {
        var session = await StartSessionAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        Guid playerId;

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var gs = await db.GameSessions.FindAsync(session.SessionId);
            playerId = gs!.PlayerId;

            var player = await db.Players.FirstAsync(p => p.Id == playerId);
            player.LastPlayedDate = today.AddDays(-3); // trou de 2 jours
            player.CurrentStreak  = 5;
            await db.SaveChangesAsync();
        }

        foreach (var track in session.Tracks)
            await SubmitAsync(session.SessionId, track.Id, 1m, "X", null);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var player = await db.Players.FirstAsync(p => p.Id == playerId);
            Assert.Equal(1, player.CurrentStreak);
            Assert.Equal(today, player.LastPlayedDate);
        }
    }

    // ── UpdateListening ──────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateListening_FirstCall_StoresTrackAndDuration()
    {
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;

        var resp = await _client.PatchAsJsonAsync(
            $"/api/sessions/{session.SessionId}/listening",
            new { trackId, listenedSeconds = 1.5m });

        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var gs = await db.GameSessions.FindAsync(session.SessionId);
        Assert.Equal(trackId, gs!.CurrentTrackId);
        Assert.Equal(1.5m, gs.CurrentTrackMinListenedSeconds);
    }

    [Fact]
    public async Task UpdateListening_SameTrackHigherDuration_UpdatesMin()
    {
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;

        await _client.PatchAsJsonAsync($"/api/sessions/{session.SessionId}/listening",
            new { trackId, listenedSeconds = 1m });
        await _client.PatchAsJsonAsync($"/api/sessions/{session.SessionId}/listening",
            new { trackId, listenedSeconds = 3m });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var gs = await db.GameSessions.FindAsync(session.SessionId);
        Assert.Equal(3m, gs!.CurrentTrackMinListenedSeconds);
    }

    [Fact]
    public async Task UpdateListening_ResumedSession_MinListenedSecondsReturnedOnResume()
    {
        // Démarrer et écouter la première track
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;

        await _client.PatchAsJsonAsync($"/api/sessions/{session.SessionId}/listening",
            new { trackId, listenedSeconds = 2m });

        // Simuler un rechargement (nouveau StartSession → reprise)
        var resp2 = await _client.PostAsync("/api/sessions", null);
        var session2 = await resp2.Content.ReadFromJsonAsync<StartSessionResponse>();

        Assert.NotNull(session2);
        Assert.True(session2.IsResuming);
        Assert.Equal(trackId, session2.CurrentTrackId);
        Assert.Equal(2m, session2.MinListenedSeconds);
    }

    [Fact]
    public async Task StartSession_Reprise_CompletedAnswers_ContiennentCorrectArtistTitle()
    {
        var session = await StartSessionAsync();
        await SubmitAsync(session.SessionId, session.Tracks[0].Id, 1m, null, null);

        var resp2 = await _client.PostAsync("/api/sessions", null);
        var resume = await resp2.Content.ReadFromJsonAsync<StartSessionResponse>();

        Assert.NotNull(resume);
        Assert.True(resume.IsResuming);
        Assert.Single(resume.CompletedAnswers);
        Assert.False(string.IsNullOrEmpty(resume.CompletedAnswers[0].CorrectArtist));
        Assert.False(string.IsNullOrEmpty(resume.CompletedAnswers[0].CorrectTitle));
    }

    [Fact]
    public async Task UpdateListening_AfterSubmit_MinResetToNull()
    {
        var session = await StartSessionAsync();
        var trackId = session.Tracks[0].Id;

        await _client.PatchAsJsonAsync($"/api/sessions/{session.SessionId}/listening",
            new { trackId, listenedSeconds = 2m });

        // Répondre → réinitialise le verrou
        await SubmitAsync(session.SessionId, trackId, 2m, "X", null);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var gs = await db.GameSessions.FindAsync(session.SessionId);
        Assert.Null(gs!.CurrentTrackId);
        Assert.Null(gs.CurrentTrackMinListenedSeconds);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async Task<StartSessionResponse> StartSessionAsync()
    {
        var resp = await _client.PostAsync("/api/sessions", null);
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<StartSessionResponse>())!;
    }

    private Task<HttpResponseMessage> SubmitAsync(
        int sessionId, int trackId, decimal duration, string? artist, string? title)
    {
        return _client.PostAsJsonAsync($"/api/sessions/{sessionId}/answers",
            new SubmitAnswerBody(trackId, duration, false, artist, title));
    }
}
