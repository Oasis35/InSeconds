using System.Net;
using System.Text;
using FluentAssertions;
using Xunit;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Admin.Tracks.AddTrack;
using InSeconds.Api.Infrastructure.Deezer;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.UnitTests.Features.Admin.Tracks;

public sealed class AddTrackHandlerTests
{
    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static DeezerClient CreateFakeDeezerClient(string artist = "Artist", string title = "Title", long id = 12345)
    {
        var json = $$$"""{"id":{{{id}}},"title":"{{{title}}}","preview":"https://fake.mp3","artist":{"name":"{{{artist}}}"}}""";
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
    public async Task Handle_WhenTrackDoesNotExist_CreatesAndReturnsTrack()
    {
        await using var db = CreateDbContext();
        var handler = new AddTrackHandler(db, CreateFakeDeezerClient("Daft Punk", "Get Lucky", 12345));

        var result = await handler.Handle(new AddTrackCommand(12345), CancellationToken.None);

        result.Should().BeOfType<Ok<AddTrackResponse>>();
        var response = ((Ok<AddTrackResponse>)result).Value!;
        response.Artist.Should().Be("Daft Punk");
        response.Title.Should().Be("Get Lucky");
        response.DeezerTrackId.Should().Be(12345);
        response.Id.Should().BeGreaterThan(0);

        (await db.Tracks.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Handle_WhenTrackAlreadyExists_ReturnsExistingWithoutDuplicate()
    {
        await using var db = CreateDbContext();
        db.Tracks.Add(new Track
        {
            Id            = 1,
            DeezerTrackId = 12345,
            Artist        = "Daft Punk",
            Title         = "Get Lucky",
            CreatedAt     = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var handler = new AddTrackHandler(db, CreateFakeDeezerClient());
        var result = await handler.Handle(new AddTrackCommand(12345), CancellationToken.None);

        result.Should().BeOfType<Ok<AddTrackResponse>>();
        var response = ((Ok<AddTrackResponse>)result).Value!;
        response.Id.Should().Be(1);
        response.Artist.Should().Be("Daft Punk");

        (await db.Tracks.CountAsync()).Should().Be(1, "pas de doublon");
    }

    [Fact]
    public async Task Handle_WhenDeezerTrackNotFound_Returns422()
    {
        await using var db = CreateDbContext();
        var handler = new AddTrackHandler(db, CreateFailingDeezerClient());

        var result = await handler.Handle(new AddTrackCommand(99999), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(422);

        (await db.Tracks.AnyAsync()).Should().BeFalse();
    }
}
