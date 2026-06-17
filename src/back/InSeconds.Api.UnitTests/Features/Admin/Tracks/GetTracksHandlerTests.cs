using FluentAssertions;
using Xunit;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.Tracks.GetTracks;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.Http;

namespace InSeconds.Api.UnitTests.Features.Admin.Tracks;

public sealed class GetTracksHandlerTests
{
    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    // Stub DeezerClient qui retourne toujours une preview vide (évite les appels réseau dans les tests)
    private static DeezerClient CreateStubDeezerClient() =>
        new(new HttpClient(new StubHttpMessageHandler()) { BaseAddress = new Uri("https://api.deezer.com") });

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"id\":0,\"title\":null,\"preview\":\"\",\"artist\":null,\"album\":null}"),
            });
    }

    private static Track BuildTrack(int id, long deezerTrackId, string artist = "Artist", string title = "Title") => new()
    {
        Id            = id,
        DeezerTrackId = deezerTrackId,
        Artist        = artist,
        Title         = title,
        CreatedAt     = DateTime.UtcNow,
    };

    [Fact]
    public async Task Handle_WhenNoTracks_ReturnsEmptyLists()
    {
        await using var db = CreateDbContext();
        var handler = new GetTracksHandler(db, CreateStubDeezerClient());

        var result = await handler.Handle(CancellationToken.None);

        result.Should().BeOfType<Ok<GetTracksResponse>>();
        var response = ((Ok<GetTracksResponse>)result).Value!;
        response.Available.Should().BeEmpty();
        response.Used.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_WhenTracksNotUsedInAnyChallenge_ReturnsAllAsAvailable()
    {
        await using var db = CreateDbContext();
        db.Tracks.AddRange(
            BuildTrack(1, 1001, "Daft Punk", "Get Lucky"),
            BuildTrack(2, 1002, "Aya Nakamura", "Djadja"));
        await db.SaveChangesAsync();

        var result = await new GetTracksHandler(db, CreateStubDeezerClient()).Handle(CancellationToken.None);

        var response = ((Ok<GetTracksResponse>)result).Value!;
        response.Available.Should().HaveCount(2);
        response.Used.Should().BeEmpty();
        response.Available.Should().BeInAscendingOrder(t => t.Artist);
    }

    [Fact]
    public async Task Handle_WhenSomeTracksUsedInChallenge_SeparatesAvailableFromUsed()
    {
        await using var db = CreateDbContext();
        db.Tracks.AddRange(
            BuildTrack(1, 1001, "Daft Punk", "Get Lucky"),
            BuildTrack(2, 1002, "Aya Nakamura", "Djadja"),
            BuildTrack(3, 1003, "Stromae", "Papaoutai"));
        db.DailyChallenges.Add(new DailyChallenge { Id = 1, Date = DateOnly.FromDateTime(DateTime.UtcNow), Seed = 1 });
        db.DailyChallengeTracks.Add(new DailyChallengeTrack
        {
            Id = 1, DailyChallengeId = 1, TrackId = 2, Position = 1, DeezerRankSnapshot = 1,
        });
        await db.SaveChangesAsync();

        var result = await new GetTracksHandler(db, CreateStubDeezerClient()).Handle(CancellationToken.None);

        var response = ((Ok<GetTracksResponse>)result).Value!;
        response.Available.Should().HaveCount(2);
        response.Used.Should().ContainSingle()
            .Which.DeezerTrackId.Should().Be(1002);
    }

    [Fact]
    public async Task Handle_TrackUsedInMultipleChallenges_AppearsOnceInUsed()
    {
        await using var db = CreateDbContext();
        db.Tracks.Add(BuildTrack(1, 1001, "Daft Punk", "Get Lucky"));
        db.DailyChallenges.AddRange(
            new DailyChallenge { Id = 1, Date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1), Seed = 1 },
            new DailyChallenge { Id = 2, Date = DateOnly.FromDateTime(DateTime.UtcNow), Seed = 2 });
        db.DailyChallengeTracks.AddRange(
            new DailyChallengeTrack { Id = 1, DailyChallengeId = 1, TrackId = 1, Position = 1, DeezerRankSnapshot = 1 },
            new DailyChallengeTrack { Id = 2, DailyChallengeId = 2, TrackId = 1, Position = 1, DeezerRankSnapshot = 1 });
        await db.SaveChangesAsync();

        var result = await new GetTracksHandler(db, CreateStubDeezerClient()).Handle(CancellationToken.None);

        var response = ((Ok<GetTracksResponse>)result).Value!;
        response.Used.Should().ContainSingle("une seule track même si utilisée deux fois");
        response.Available.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_AvailableTrackHasPreviewSet()
    {
        await using var db = CreateDbContext();
        db.Tracks.Add(BuildTrack(1, 1001, "Daft Punk", "Get Lucky"));
        await db.SaveChangesAsync();

        var result = await new GetTracksHandler(db, CreateStubDeezerClient()).Handle(CancellationToken.None);

        var response = ((Ok<GetTracksResponse>)result).Value!;
        // Le stub retourne preview vide → HasPreview = false
        response.Available.Single().HasPreview.Should().Be(false);
    }

    [Fact]
    public async Task Handle_UsedTrackHasNoPreviewField()
    {
        await using var db = CreateDbContext();
        db.Tracks.Add(BuildTrack(1, 1001, "Daft Punk", "Get Lucky"));
        db.DailyChallenges.Add(new DailyChallenge { Id = 1, Date = DateOnly.FromDateTime(DateTime.UtcNow), Seed = 1 });
        db.DailyChallengeTracks.Add(new DailyChallengeTrack
        {
            Id = 1, DailyChallengeId = 1, TrackId = 1, Position = 1, DeezerRankSnapshot = 1,
        });
        await db.SaveChangesAsync();

        var result = await new GetTracksHandler(db, CreateStubDeezerClient()).Handle(CancellationToken.None);

        var response = ((Ok<GetTracksResponse>)result).Value!;
        response.Used.Single().HasPreview.Should().BeNull();
    }
}
