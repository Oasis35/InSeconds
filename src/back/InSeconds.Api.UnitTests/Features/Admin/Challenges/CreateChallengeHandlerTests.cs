using System.Net;
using System.Text;
using FluentAssertions;
using Xunit;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.Challenges.CreateChallenge;
using InSeconds.Api.Features.Admin.Challenges.GetChallenges;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.UnitTests.Features.Admin.Challenges;

public sealed class CreateChallengeHandlerTests
{
    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static DeezerClient CreateFakeDeezerClient(long deezerTrackId = 12345, string artist = "Daft Punk", string title = "Get Lucky")
    {
        var json = $$$"""{"id":{{{deezerTrackId}}},"title":"{{{title}}}","preview":"https://fake.mp3","artist":{"name":"{{{artist}}}"},"album":{"cover_medium":"https://cdn-images.dzcdn.net/images/cover/abc123/250x250-000000-80-0-0.jpg"}}""";
        var handler = new FakeHttpMessageHandler(
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            });
        return new DeezerClient(new HttpClient(handler) { BaseAddress = new Uri("https://api.deezer.com") });
    }

    private static DeezerClient CreateFailingDeezerClient()
    {
        var handler = new FakeHttpMessageHandler(new HttpResponseMessage(HttpStatusCode.NotFound));
        return new DeezerClient(new HttpClient(handler) { BaseAddress = new Uri("https://api.deezer.com") });
    }

    private sealed class FakeHttpMessageHandler(HttpResponseMessage response) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(response);
    }

    [Fact]
    public async Task Handle_WhenValidNewTracks_CreatesChallengeAndReturns200()
    {
        await using var db = CreateDbContext();
        var date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);
        var command = new CreateChallengeCommand(date, [12345L]);

        var result = await new CreateChallengeHandler(db, CreateFakeDeezerClient(12345)).Handle(command, CancellationToken.None);

        result.Should().BeOfType<Ok<ChallengeDto>>();
        var dto = ((Ok<ChallengeDto>)result).Value!;
        dto.Date.Should().Be(date);
        dto.Tracks.Should().ContainSingle()
            .Which.DeezerTrackId.Should().Be(12345);

        (await db.DailyChallenges.CountAsync()).Should().Be(1);
        (await db.Tracks.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Handle_WhenTrackAlreadyInPool_ReusesExistingTrackWithoutDuplicate()
    {
        await using var db = CreateDbContext();
        db.Tracks.Add(new Track
        {
            Id = 1, DeezerTrackId = 12345, Artist = "Daft Punk", Title = "Get Lucky", CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);
        var result = await new CreateChallengeHandler(db, CreateFakeDeezerClient()).Handle(
            new CreateChallengeCommand(date, [12345L]), CancellationToken.None);

        result.Should().BeOfType<Ok<ChallengeDto>>();
        (await db.Tracks.CountAsync()).Should().Be(1, "pas de doublon");
    }

    [Fact]
    public async Task Handle_WhenDateAlreadyHasChallenge_Returns409Conflict()
    {
        await using var db = CreateDbContext();
        var date = DateOnly.FromDateTime(DateTime.UtcNow);
        db.DailyChallenges.Add(new DailyChallenge { Id = 1, Date = date, Seed = 1 });
        await db.SaveChangesAsync();

        var result = await new CreateChallengeHandler(db, CreateFakeDeezerClient()).Handle(
            new CreateChallengeCommand(date, [12345L]), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status409Conflict);
        (await db.DailyChallenges.CountAsync()).Should().Be(1, "pas de second défi créé");
    }

    [Fact]
    public async Task Handle_WhenDeezerTrackNotFound_Returns422()
    {
        await using var db = CreateDbContext();
        var date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);

        var result = await new CreateChallengeHandler(db, CreateFailingDeezerClient()).Handle(
            new CreateChallengeCommand(date, [99999L]), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);
        (await db.DailyChallenges.AnyAsync()).Should().BeFalse("aucun défi ne doit être créé si une track est invalide");
    }

    [Fact]
    public async Task Handle_MultipleTracks_AssignsPositionsInOrder()
    {
        await using var db = CreateDbContext();
        db.Tracks.AddRange(
            new Track { Id = 1, DeezerTrackId = 1001, Artist = "A", Title = "T1", CreatedAt = DateTime.UtcNow },
            new Track { Id = 2, DeezerTrackId = 1002, Artist = "B", Title = "T2", CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var date = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);
        var result = await new CreateChallengeHandler(db, CreateFakeDeezerClient()).Handle(
            new CreateChallengeCommand(date, [1001L, 1002L]), CancellationToken.None);

        result.Should().BeOfType<Ok<ChallengeDto>>();
        var dto = ((Ok<ChallengeDto>)result).Value!;
        dto.Tracks.Should().HaveCount(2);
        dto.Tracks.Select(t => t.Position).Should().Equal(1, 2);
    }
}
