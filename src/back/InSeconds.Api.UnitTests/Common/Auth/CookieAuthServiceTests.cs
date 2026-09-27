using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Auth;
using InSeconds.Api.Domain;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using NSubstitute;

namespace InSeconds.Api.UnitTests.Common.Auth;

public sealed class CookieAuthServiceTests
{
    // ---------------------------------------------------------------------------
    // Fixture
    // ---------------------------------------------------------------------------

    private static ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static CookieAuthService CreateService(ApplicationDbContext db, bool isDevelopment = true)
    {
        var env = Substitute.For<IHostEnvironment>();
        env.EnvironmentName.Returns(isDevelopment ? Environments.Development : Environments.Production);

        var protectionProvider = new EphemeralDataProtectionProvider();
        var protector = protectionProvider.CreateProtector("InSeconds.Auth.Cookie");

        return new CookieAuthService(db, protector, env);
    }

    private static DefaultHttpContext CreateHttpContext()
    {
        var ctx = new DefaultHttpContext();
        ctx.Response.Body = new MemoryStream();
        return ctx;
    }

    // ---------------------------------------------------------------------------
    // Tests
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task ResolveOrCreate_WhenNoCookie_CreatesGuestPlayerAndSetsCookie()
    {
        // Arrange
        await using var db = CreateDbContext();
        var service = CreateService(db);
        var httpContext = CreateHttpContext();

        // Act
        var playerId = await service.ResolveOrCreatePlayerAsync(httpContext);

        // Assert
        var player = await db.Players.FindAsync(playerId);
        player.Should().NotBeNull();
        player!.IsGuest.Should().BeTrue();
        player.LastSeenAt.Should().BeNull();

        httpContext.Response.Headers.ContainsKey("Set-Cookie").Should().BeTrue();
    }

    [Fact]
    public async Task ResolveOrCreate_WhenValidCookie_ReturnsExistingPlayerAndUpdatesLastSeenAt()
    {
        // Arrange
        await using var db = CreateDbContext();
        var service = CreateService(db);

        // Premier appel → crée le player + pose le cookie
        var firstContext = CreateHttpContext();
        var playerId = await service.ResolveOrCreatePlayerAsync(firstContext);

        // Récupérer la valeur du cookie posé
        var setCookieHeader = firstContext.Response.Headers["Set-Cookie"].ToString();
        var cookieValue = setCookieHeader
            .Split(';')[0]
            .Replace($"{CookieAuthService.CookieName}=", "");

        // Deuxième appel avec le cookie
        var secondContext = CreateHttpContext();
        secondContext.Request.Headers["Cookie"] = $"{CookieAuthService.CookieName}={cookieValue}";

        // Act
        var resolvedPlayerId = await service.ResolveOrCreatePlayerAsync(secondContext);

        // Assert
        resolvedPlayerId.Should().Be(playerId);

        var player = await db.Players.FindAsync(playerId);
        player!.LastSeenAt.Should().NotBeNull();
    }

    [Fact]
    public async Task ResolveOrCreate_WhenCookieValueIsInvalid_CreatesNewPlayer()
    {
        // Arrange
        await using var db = CreateDbContext();
        var service = CreateService(db);
        var httpContext = CreateHttpContext();
        httpContext.Request.Headers["Cookie"] = $"{CookieAuthService.CookieName}=valeur-non-protegee-invalide";

        // Act
        var playerId = await service.ResolveOrCreatePlayerAsync(httpContext);

        // Assert
        var player = await db.Players.FindAsync(playerId);
        player.Should().NotBeNull();
        player!.IsGuest.Should().BeTrue();
    }

    [Fact]
    public async Task ResolveOrCreate_WhenCookieHasUnknownAuthToken_CreatesNewPlayer()
    {
        // Arrange
        await using var db = CreateDbContext();

        // Protéger un AuthToken valide mais inconnu en DB
        var protectionProvider = new EphemeralDataProtectionProvider();
        var protector = protectionProvider.CreateProtector("InSeconds.Auth.Cookie");
        var unknownToken = protector.Protect(Guid.NewGuid().ToString());

        var env = Substitute.For<IHostEnvironment>();
        env.EnvironmentName.Returns(Environments.Development);
        var service = new CookieAuthService(db, protector, env);

        var httpContext = CreateHttpContext();
        httpContext.Request.Headers["Cookie"] = $"{CookieAuthService.CookieName}={unknownToken}";

        // Act
        var playerId = await service.ResolveOrCreatePlayerAsync(httpContext);

        // Assert
        var players = await db.Players.ToListAsync();
        players.Should().ContainSingle()
            .Which.Id.Should().Be(playerId);
    }

    [Fact]
    public async Task TryResolvePlayer_WhenNoCookie_ReturnsNullAndCreatesNoPlayer()
    {
        // Arrange
        await using var db = CreateDbContext();
        var service = CreateService(db);
        var httpContext = CreateHttpContext();

        // Act
        var resolution = await service.TryResolvePlayerAsync(httpContext);

        // Assert
        resolution.Should().BeNull();
        (await db.Players.CountAsync()).Should().Be(0);
        httpContext.Response.Headers.ContainsKey("Set-Cookie").Should().BeFalse();
    }

    [Fact]
    public async Task TryResolvePlayer_WhenValidCookie_ReturnsExistingPlayerAndUpdatesLastSeenAt()
    {
        // Arrange
        await using var db = CreateDbContext();
        var service = CreateService(db);

        var firstContext = CreateHttpContext();
        var createdId = await service.ResolveOrCreatePlayerAsync(firstContext);

        var setCookieHeader = firstContext.Response.Headers["Set-Cookie"].ToString();
        var cookieValue = setCookieHeader
            .Split(';')[0]
            .Replace($"{CookieAuthService.CookieName}=", "");

        var secondContext = CreateHttpContext();
        secondContext.Request.Headers["Cookie"] = $"{CookieAuthService.CookieName}={cookieValue}";

        // Act
        var resolution = await service.TryResolvePlayerAsync(secondContext);

        // Assert
        resolution.Should().NotBeNull();
        resolution!.PlayerId.Should().Be(createdId);
        resolution.IsAdmin.Should().BeFalse();
        (await db.Players.CountAsync()).Should().Be(1);
        (await db.Players.FindAsync(createdId))!.LastSeenAt.Should().NotBeNull();
    }

    [Fact]
    public async Task TryResolvePlayer_WhenPlayerIsAdmin_ReturnsIsAdminTrue()
    {
        // Arrange
        await using var db = CreateDbContext();
        var service = CreateService(db);

        var firstContext = CreateHttpContext();
        var createdId = await service.ResolveOrCreatePlayerAsync(firstContext);

        var player = await db.Players.FindAsync(createdId);
        player!.PromoteToAdminForTesting();
        await db.SaveChangesAsync();

        var setCookieHeader = firstContext.Response.Headers["Set-Cookie"].ToString();
        var cookieValue = setCookieHeader
            .Split(';')[0]
            .Replace($"{CookieAuthService.CookieName}=", "");

        var secondContext = CreateHttpContext();
        secondContext.Request.Headers["Cookie"] = $"{CookieAuthService.CookieName}={cookieValue}";

        // Act
        var resolution = await service.TryResolvePlayerAsync(secondContext);

        // Assert
        resolution.Should().NotBeNull();
        resolution!.IsAdmin.Should().BeTrue();
    }

    // M3 (revue du 25/09) : une erreur inattendue (ex: DB indisponible) pendant la résolution
    // du cookie ne doit plus être avalée comme "cookie invalide" — sinon le joueur perdait
    // définitivement son identité (nouvel invité créé + cookie réécrit) sur un simple hoquet
    // réseau. Seules les erreurs de déchiffrement (CryptographicException/FormatException)
    // restent traitées comme "pas de Player".
    //
    // Ne pas simuler ce cas en faisant lever une exception depuis IDataProtector.Unprotect
    // (byte[]) : l'extension ASP.NET Core Unprotect(string) enveloppe elle-même TOUTE
    // exception qui n'est pas déjà une CryptographicException dans... une CryptographicException
    // (homogénéisation des erreurs de déchiffrement) — un mock qui throw à cet endroit atterrit
    // donc toujours dans notre propre catch, jamais en propagation, quel que soit le type
    // d'exception levée par le mock. Le seul endroit qui peut réellement laisser fuiter un type
    // d'exception arbitraire est la requête DB elle-même, hors du try/catch restreint.
    [Fact]
    public async Task ResolveOrCreate_WhenDbQueryThrowsUnexpectedException_Propagates()
    {
        // Arrange
        var db = CreateDbContext();
        var protectionProvider = new EphemeralDataProtectionProvider();
        var protector = protectionProvider.CreateProtector("InSeconds.Auth.Cookie");
        var env = Substitute.For<IHostEnvironment>();
        env.EnvironmentName.Returns(Environments.Development);
        var service = new CookieAuthService(db, protector, env);

        var httpContext = CreateHttpContext();
        // Cookie syntaxiquement valide (déchiffrement réussi) — l'échec doit venir d'ailleurs.
        var validToken = protector.Protect(Guid.NewGuid().ToString());
        httpContext.Request.Headers["Cookie"] = $"{CookieAuthService.CookieName}={validToken}";

        // Simule une panne DB (timeout, connexion coupée...) au moment de la requête —
        // db.Players.FirstOrDefaultAsync lève ObjectDisposedException sur un contexte disposé.
        await db.DisposeAsync();

        // Act
        Func<Task> act = () => service.ResolveOrCreatePlayerAsync(httpContext);

        // Assert
        await act.Should().ThrowAsync<ObjectDisposedException>();
    }

    [Fact]
    public async Task ResolveOrCreate_InProduction_SetsCookieSecure()
    {
        // Arrange
        await using var db = CreateDbContext();
        var service = CreateService(db, isDevelopment: false);
        var httpContext = CreateHttpContext();

        // Act
        await service.ResolveOrCreatePlayerAsync(httpContext);

        // Assert — le header Set-Cookie doit contenir "secure"
        var setCookieHeader = httpContext.Response.Headers["Set-Cookie"].ToString();
        setCookieHeader.ToLowerInvariant().Should().Contain("secure");
    }
}
