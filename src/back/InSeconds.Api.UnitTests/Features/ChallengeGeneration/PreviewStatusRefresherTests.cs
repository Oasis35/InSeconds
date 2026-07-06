using System.Net;
using System.Text;
using FluentAssertions;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace InSeconds.Api.UnitTests.Features.ChallengeGeneration;

public sealed class PreviewStatusRefresherTests
{
    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static PreviewStatusRefresher CreateRefresher(ApplicationDbContext db, Func<long, HttpResponseMessage> respond)
    {
        var http = new HttpClient(new RoutingHandler(respond)) { BaseAddress = new Uri("https://api.deezer.com") };
        var deezer = new DeezerClient(http, NullLogger<DeezerClient>.Instance);
        return new PreviewStatusRefresher(db, deezer, NullLogger<PreviewStatusRefresher>.Instance);
    }

    private static Track BuildTrack(int id, bool hasPreview) => new()
    {
        Id            = id,
        DeezerTrackId = 1000L + id,
        Artist        = "Artist",
        Title         = "Title",
        HasPreview    = hasPreview,
        CreatedAt     = DateTime.UtcNow,
    };

    private static HttpResponseMessage Json(string body)
        => new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static HttpResponseMessage TrackWithPreview()
        => Json("""{"id":1,"title":"T","preview":"https://fake-preview.mp3","artist":{"name":"A"}}""");

    private static HttpResponseMessage TrackWithoutPreview()
        => Json("""{"id":1,"title":"T","preview":"","artist":{"name":"A"}}""");

    private static HttpResponseMessage QuotaError()
        => Json("""{"error":{"type":"Exception","message":"Quota limit exceeded","code":4}}""");

    [Fact]
    public async Task Deezer_failure_does_not_touch_flag()
    {
        // Un morceau valide (HasPreview = true) dont le check échoue (quota / rate limit) :
        // l'état Deezer est inconnu, le flag doit rester intact.
        using var db = CreateDbContext();
        db.Tracks.Add(BuildTrack(1, hasPreview: true));
        await db.SaveChangesAsync();

        var refresher = CreateRefresher(db, _ => QuotaError());
        var result = await refresher.RefreshAsync();

        result.Should().Be(new RefreshPreviewsResult(Checked: 1, Updated: 0, Failed: 1));
        (await db.Tracks.SingleAsync()).HasPreview.Should().BeTrue();
    }

    [Fact]
    public async Task Http_error_does_not_touch_flag()
    {
        using var db = CreateDbContext();
        db.Tracks.Add(BuildTrack(1, hasPreview: true));
        await db.SaveChangesAsync();

        var refresher = CreateRefresher(db, _ => new HttpResponseMessage(HttpStatusCode.InternalServerError));
        var result = await refresher.RefreshAsync();

        result.Failed.Should().Be(1);
        (await db.Tracks.SingleAsync()).HasPreview.Should().BeTrue();
    }

    [Fact]
    public async Task Genuinely_missing_preview_sets_flag_to_false()
    {
        using var db = CreateDbContext();
        db.Tracks.Add(BuildTrack(1, hasPreview: true));
        await db.SaveChangesAsync();

        var refresher = CreateRefresher(db, _ => TrackWithoutPreview());
        var result = await refresher.RefreshAsync();

        result.Should().Be(new RefreshPreviewsResult(Checked: 1, Updated: 1, Failed: 0));
        (await db.Tracks.SingleAsync()).HasPreview.Should().BeFalse();
    }

    [Fact]
    public async Task Restored_preview_sets_flag_back_to_true()
    {
        // Le scénario « réparation » : flag corrompu à false alors que la preview existe.
        using var db = CreateDbContext();
        db.Tracks.Add(BuildTrack(1, hasPreview: false));
        await db.SaveChangesAsync();

        var refresher = CreateRefresher(db, _ => TrackWithPreview());
        var result = await refresher.RefreshAsync();

        result.Should().Be(new RefreshPreviewsResult(Checked: 1, Updated: 1, Failed: 0));
        (await db.Tracks.SingleAsync()).HasPreview.Should().BeTrue();
    }

    [Fact]
    public async Task Mixed_pool_only_updates_determinate_results()
    {
        using var db = CreateDbContext();
        db.Tracks.AddRange(
            BuildTrack(1, hasPreview: false),  // preview revenue → true
            BuildTrack(2, hasPreview: true),   // échec Deezer → intact
            BuildTrack(3, hasPreview: true));  // vraie absence → false
        await db.SaveChangesAsync();

        var refresher = CreateRefresher(db, deezerId => deezerId switch
        {
            1001 => TrackWithPreview(),
            1002 => QuotaError(),
            _    => TrackWithoutPreview(),
        });
        var result = await refresher.RefreshAsync();

        result.Should().Be(new RefreshPreviewsResult(Checked: 3, Updated: 2, Failed: 1));
        var tracks = await db.Tracks.OrderBy(t => t.Id).ToListAsync();
        tracks[0].HasPreview.Should().BeTrue();
        tracks[1].HasPreview.Should().BeTrue();
        tracks[2].HasPreview.Should().BeFalse();
    }

    [Fact]
    public async Task Tracks_used_in_a_challenge_are_skipped()
    {
        using var db = CreateDbContext();
        var track = BuildTrack(1, hasPreview: true);
        db.Tracks.Add(track);
        db.DailyChallenges.Add(new DailyChallenge
        {
            Id    = 1,
            Date  = new DateOnly(2026, 7, 1),
            Seed  = 42,
            Tracks = [new DailyChallengeTrack { TrackId = 1, Position = 1 }],
        });
        await db.SaveChangesAsync();

        var refresher = CreateRefresher(db, _ => TrackWithoutPreview());
        var result = await refresher.RefreshAsync();

        result.Should().Be(new RefreshPreviewsResult(Checked: 0, Updated: 0, Failed: 0));
        (await db.Tracks.SingleAsync()).HasPreview.Should().BeTrue();
    }

    // Route chaque appel /track/{id} vers la réponse voulue.
    private sealed class RoutingHandler(Func<long, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            var path = request.RequestUri!.AbsolutePath;
            var id = long.Parse(path["/track/".Length..]);
            return Task.FromResult(respond(id));
        }
    }
}
