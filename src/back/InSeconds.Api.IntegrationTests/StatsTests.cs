using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Features.Stats.Today;
using InSeconds.Api.Features.Sessions.StartSession;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.Api.IntegrationTests;

[Collection("Integration")]
public class StatsTests(IntegrationTestFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.Client;

    public Task InitializeAsync() => factory.ResetAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task TodayStats_SansSession_RetourneScoreNullEtZeroJoueurs()
    {
        var resp = await _client.GetAsync("/api/stats/today");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<TodayStatsResponse>();
        Assert.NotNull(body);
        Assert.Null(body.YourScore);
        Assert.Equal(0, body.TotalPlayers);
        // Appel anonyme (sans partie finie) : les morceaux du jour ne sont pas révélés.
        Assert.Empty(body.Tracks);
    }

    [Fact]
    public async Task TodayStats_ApresUnePartie_RetourneScoreEtUnJoueur()
    {
        // Joue une partie complète (3 morceaux → session Completed)
        var sessionResp = await _client.PostAsync("/api/sessions", null);
        var session = await sessionResp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);

        foreach (var track in session.Tracks)
        {
            await _client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
                new SubmitAnswerBody(track.Id, 1m, false, "Eminem", "Lose Yourself"));
        }

        var resp = await _client.GetAsync("/api/stats/today");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<TodayStatsResponse>();
        Assert.NotNull(body);
        Assert.NotNull(body.YourScore);
        Assert.Equal(1, body.TotalPlayers);
        Assert.True(body.YourScore >= 0);
    }

    [Fact]
    public async Task TodayStats_ApresUnePartie_RetourneRepartitionDesScores()
    {
        var sessionResp = await _client.PostAsync("/api/sessions", null);
        var session = await sessionResp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);

        foreach (var track in session.Tracks)
        {
            await _client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
                new SubmitAnswerBody(track.Id, 1m, false, "Eminem", "Lose Yourself"));
        }

        var body = await _client.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");

        Assert.NotNull(body);
        Assert.NotNull(body.YourScore);
        // Seul joueur : plus bas = plus haut = son score, pas de % (personne d'autre à battre).
        Assert.Equal(body.YourScore, body.MinScore);
        Assert.Equal(body.YourScore, body.MaxScore);
        Assert.Null(body.BetterThanPercent);
        Assert.True(body.MaxPossibleScore >= body.YourScore);
        Assert.Equal(10, body.ScoreDistribution.Count);
        var bucket = body.ScoreDistribution.Single(b => b.Count > 0);
        Assert.Equal(1, bucket.Count);
        Assert.InRange(body.YourScore.Value, bucket.MinScore, bucket.MaxScore);
    }

    [Fact]
    public async Task TodayStats_ApresPartieComplete_ReveleLesMorceaux()
    {
        await PlayFullGameAsync(_client);

        var body = await _client.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");

        Assert.NotNull(body);
        Assert.Equal(5, body.Tracks.Count); // le défi du jour a 5 morceaux
        Assert.All(body.Tracks, t =>
        {
            Assert.True(t.Position >= 1);
            Assert.NotEmpty(t.Artist);
            Assert.NotEmpty(t.Title);
            Assert.True(t.DeezerTrackId > 0);
        });
    }

    [Fact]
    public async Task TodayStats_PartieEnCours_NeRevelePasLesMorceaux()
    {
        // Scénario de triche : démarrer la partie puis lire les stats dans un autre onglet.
        var session = await StartSessionAsync(_client);
        await _client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
            new SubmitAnswerBody(session.Tracks[0].Id, 1m, false, "X", null));

        var body = await _client.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");

        Assert.NotNull(body);
        Assert.Empty(body.Tracks);
    }

    [Fact]
    public async Task TodayStats_AutreJoueurAFini_NeRevelePasLesMorceauxAUnAnonyme()
    {
        await PlayFullGameAsync(_client);

        var anonymous = factory.CreateClient();
        var body = await anonymous.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");

        Assert.NotNull(body);
        Assert.Equal(1, body.TotalPlayers); // les chiffres anonymes restent visibles
        Assert.Empty(body.Tracks);
    }

    [Fact]
    public async Task TodayStats_TitreAvecParentheses_EstNettoyeDansTrackStat()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var challengeTrack = await db.DailyChallengeTracks
                .Include(t => t.Track)
                .Include(t => t.DailyChallenge)
                .FirstAsync(t => t.DailyChallenge.Date == today && t.Position == 1);
            challengeTrack.Track.Title = "Lose Yourself (Remastered 2013)";
            await db.SaveChangesAsync();
        }

        await PlayFullGameAsync(_client);
        var resp = await _client.GetAsync("/api/stats/today");

        var body = await resp.Content.ReadFromJsonAsync<TodayStatsResponse>();
        Assert.NotNull(body);
        var track = body.Tracks.Single(t => t.Position == 1);
        Assert.Equal("Lose Yourself", track.Title);
    }

    [Fact]
    public async Task TodayStats_PartieAbandonee_NApparaitPasDansLesStats()
    {
        // Démarrer une session puis abandonner
        var sessionResp = await _client.PostAsync("/api/sessions", null);
        var session = await sessionResp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);

        var abandonResp = await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);
        Assert.Equal(HttpStatusCode.NoContent, abandonResp.StatusCode);

        var resp = await _client.GetAsync("/api/stats/today");
        var body = await resp.Content.ReadFromJsonAsync<TodayStatsResponse>();
        Assert.NotNull(body);
        Assert.Equal(0, body.TotalPlayers);
        Assert.Null(body.YourScore);
    }

    [Fact]
    public async Task TodayStats_PartiePending_NApparaitPasDansLesStats()
    {
        // Démarrer une session et répondre à un seul morceau (reste Pending)
        var sessionResp = await _client.PostAsync("/api/sessions", null);
        var session = await sessionResp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);

        await _client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
            new SubmitAnswerBody(session.Tracks[0].Id, 1m, false, "X", null));

        var resp = await _client.GetAsync("/api/stats/today");
        var body = await resp.Content.ReadFromJsonAsync<TodayStatsResponse>();
        Assert.NotNull(body);
        Assert.Equal(0, body.TotalPlayers);
        Assert.Null(body.YourScore);
    }

    [Fact]
    public async Task TodayStats_ApresPartieComplete_RetourneReponsesJoueurDansTrackStat()
    {
        // Joue une partie complète
        var sessionResp = await _client.PostAsync("/api/sessions", null);
        var session = await sessionResp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);

        foreach (var track in session.Tracks)
        {
            await _client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
                new SubmitAnswerBody(track.Id, 1m, false, "Eminem", "Lose Yourself"));
        }

        var resp = await _client.GetAsync("/api/stats/today");
        var body = await resp.Content.ReadFromJsonAsync<TodayStatsResponse>();
        Assert.NotNull(body);

        // Chaque TrackStat expose la réponse du joueur + son score + un histogramme (un bucket par palier).
        Assert.All(body.Tracks, t =>
        {
            Assert.NotNull(t.ArtistCorrect);
            Assert.NotNull(t.TitleCorrect);
            Assert.NotNull(t.ListenedDurationSeconds);
            Assert.Equal(1m, t.ListenedDurationSeconds);
            Assert.NotNull(t.Score);
            Assert.True(t.Score >= 0);
            Assert.NotEmpty(t.GuessTimeDistribution);
        });

        // On a répondu "Eminem / Lose Yourself" pour les 3 morceaux → seul le morceau 1 est correct :
        // son histogramme a 1 bonne réponse à 1s et aucun échec ; les autres l'inverse.
        var track1 = body.Tracks.Single(t => t.Position == 1);
        Assert.Equal(1, track1.GuessTimeDistribution.Single(b => b.DurationSeconds == 1m).Count);
        Assert.Equal(0, track1.NotFoundCount);
        Assert.All(body.Tracks.Where(t => t.Position != 1), t =>
        {
            Assert.All(t.GuessTimeDistribution, b => Assert.Equal(0, b.Count));
            Assert.Equal(1, t.NotFoundCount);
        });
    }

    [Fact]
    public async Task TodayStats_PartieAbandonnee_ReveleLesMorceauxSansReponsesJoueur()
    {
        // Partie abandonnée : morceaux révélés, mais pas de réponse joueur (session non complétée).
        var session = await StartSessionAsync(_client);
        await _client.PutAsync($"/api/sessions/{session.SessionId}/abandon", null);

        var body = await _client.GetFromJsonAsync<TodayStatsResponse>("/api/stats/today");

        Assert.NotNull(body);
        Assert.Equal(5, body.Tracks.Count);
        Assert.All(body.Tracks, t => Assert.Null(t.Score));
    }

    private static async Task<StartSessionResponse> StartSessionAsync(HttpClient client)
    {
        var resp = await client.PostAsync("/api/sessions", null);
        var session = await resp.Content.ReadFromJsonAsync<StartSessionResponse>();
        Assert.NotNull(session);
        return session;
    }

    private static async Task PlayFullGameAsync(HttpClient client)
    {
        var session = await StartSessionAsync(client);
        foreach (var track in session.Tracks)
        {
            await client.PostAsJsonAsync($"/api/sessions/{session.SessionId}/answers",
                new SubmitAnswerBody(track.Id, 1m, false, "Eminem", "Lose Yourself"));
        }
    }
}
