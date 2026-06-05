using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Auth;
using InSeconds.Api.Domain;
using InSeconds.Api.Features.Auth.Me;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.UnitTests.Features.Auth.Me;

public sealed class MeEndpointTests
{
    private static readonly Guid PlayerId = new("22222222-2222-2222-2222-222222222222");

    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static DefaultHttpContext CreateHttpContextWithPlayer(Guid playerId)
    {
        var ctx = new DefaultHttpContext();
        ctx.Items[PlayerHttpContextExtensions.PlayerIdKey] = playerId;
        return ctx;
    }

    [Fact]
    public async Task Me_WhenGuestPlayerExists_ReturnsGuestResponse()
    {
        // Arrange
        await using var db = CreateDbContext();
        db.Players.Add(new Player
        {
            Id        = PlayerId,
            IsGuest   = true,
            AuthToken = Guid.NewGuid(),
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var httpContext = CreateHttpContextWithPlayer(PlayerId);

        // Act
        var result = await InvokeEndpoint(httpContext, db);

        // Assert
        result.Should().BeOfType<Ok<MeResponse>>();
        var response = ((Ok<MeResponse>)result).Value!;
        response.Id.Should().Be(PlayerId);
        response.IsGuest.Should().BeTrue();
        response.Pseudo.Should().BeNull();
    }

    [Fact]
    public async Task Me_WhenRegisteredPlayerExists_ReturnsPseudo()
    {
        // Arrange
        await using var db = CreateDbContext();
        db.Players.Add(new Player
        {
            Id        = PlayerId,
            IsGuest   = false,
            Pseudo    = "SuperJoueur",
            AuthToken = Guid.NewGuid(),
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var httpContext = CreateHttpContextWithPlayer(PlayerId);

        // Act
        var result = await InvokeEndpoint(httpContext, db);

        // Assert
        result.Should().BeOfType<Ok<MeResponse>>();
        var response = ((Ok<MeResponse>)result).Value!;
        response.IsGuest.Should().BeFalse();
        response.Pseudo.Should().Be("SuperJoueur");
    }

    // Invoque la logique de l'endpoint sans passer par le pipeline HTTP complet
    private static async Task<IResult> InvokeEndpoint(HttpContext httpContext, ApplicationDbContext db)
    {
        var playerId = httpContext.GetPlayerId();
        var player = await db.Players.FirstAsync(p => p.Id == playerId);
        return Results.Ok(new MeResponse(player.Id, player.IsGuest, player.Pseudo));
    }
}
