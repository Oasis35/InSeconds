using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using NSubstitute;

namespace InSeconds.Api.UnitTests.Common.Auth;

public sealed class PlayerAuthMiddlewareTests
{
    private static DefaultHttpContext CreateHttpContext(string path)
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Path = path;
        ctx.Response.Body = new MemoryStream();
        return ctx;
    }

    private static IHostEnvironment CreateEnv(string name = Environments.Production)
    {
        var env = Substitute.For<IHostEnvironment>();
        env.EnvironmentName.Returns(name);
        return env;
    }

    [Fact]
    public async Task InvokeAsync_OnPlayerRoute_WhenPlayerResolved_StoresInItems()
    {
        // Arrange
        var expectedId = Guid.NewGuid();
        var cookieAuth = Substitute.For<ICookieAuthService>();
        cookieAuth.TryResolvePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>())
            .Returns(new PlayerAuthResolution(expectedId, false));

        var middleware = new PlayerAuthMiddleware(_ => Task.CompletedTask, CreateEnv());
        var httpContext = CreateHttpContext("/api/sessions");

        // Act
        await middleware.InvokeAsync(httpContext, cookieAuth);

        // Assert
        httpContext.Items[PlayerHttpContextExtensions.PlayerIdKey].Should().Be(expectedId);
        httpContext.GetPlayerIsAdmin().Should().BeFalse();
        await cookieAuth.Received(1).TryResolvePlayerAsync(httpContext, Arg.Any<CancellationToken>());
        await cookieAuth.DidNotReceive().ResolveOrCreatePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task InvokeAsync_OnPlayerRoute_WhenPlayerIsAdmin_SetsIsAdminTrue()
    {
        // Arrange
        var expectedId = Guid.NewGuid();
        var cookieAuth = Substitute.For<ICookieAuthService>();
        cookieAuth.TryResolvePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>())
            .Returns(new PlayerAuthResolution(expectedId, true));

        var middleware = new PlayerAuthMiddleware(_ => Task.CompletedTask, CreateEnv());
        var httpContext = CreateHttpContext("/api/admin/tracks");

        // Act
        await middleware.InvokeAsync(httpContext, cookieAuth);

        // Assert
        httpContext.GetPlayerIsAdmin().Should().BeTrue();
    }

    [Fact]
    public async Task InvokeAsync_OnAdminRoute_ResolvesPlayerLikeAnyOtherRoute()
    {
        // Arrange : /api/admin n'est plus exclu — l'accès admin est un rôle sur le cookie joueur
        var expectedId = Guid.NewGuid();
        var cookieAuth = Substitute.For<ICookieAuthService>();
        cookieAuth.TryResolvePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>())
            .Returns(new PlayerAuthResolution(expectedId, false));

        var middleware = new PlayerAuthMiddleware(_ => Task.CompletedTask, CreateEnv());
        var httpContext = CreateHttpContext("/api/admin/challenges");

        // Act
        await middleware.InvokeAsync(httpContext, cookieAuth);

        // Assert
        await cookieAuth.Received(1).TryResolvePlayerAsync(httpContext, Arg.Any<CancellationToken>());
        httpContext.Items[PlayerHttpContextExtensions.PlayerIdKey].Should().Be(expectedId);
    }

    [Fact]
    public async Task InvokeAsync_OnPlayerRoute_WhenNoCookie_DoesNotStorePlayerIdAndDoesNotCreate()
    {
        // Arrange : visiteur sans cookie (jamais joué) — aucun Player ne doit être créé
        var cookieAuth = Substitute.For<ICookieAuthService>();
        cookieAuth.TryResolvePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>())
            .Returns((PlayerAuthResolution?)null);

        var middleware = new PlayerAuthMiddleware(_ => Task.CompletedTask, CreateEnv());
        var httpContext = CreateHttpContext("/api/settings");

        // Act
        await middleware.InvokeAsync(httpContext, cookieAuth);

        // Assert
        httpContext.Items.Should().NotContainKey(PlayerHttpContextExtensions.PlayerIdKey);
        await cookieAuth.DidNotReceive().ResolveOrCreatePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task InvokeAsync_OnSkippedRoute_DoesNotCallCookieAuth()
    {
        // Arrange : seul /health reste exclu
        var cookieAuth = Substitute.For<ICookieAuthService>();
        var middleware = new PlayerAuthMiddleware(_ => Task.CompletedTask, CreateEnv());
        var httpContext = CreateHttpContext("/health");

        // Act
        await middleware.InvokeAsync(httpContext, cookieAuth);

        // Assert
        await cookieAuth.DidNotReceive().TryResolvePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>());
        await cookieAuth.DidNotReceive().ResolveOrCreatePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>());
        httpContext.Items.Should().NotContainKey(PlayerHttpContextExtensions.PlayerIdKey);
    }

    [Fact]
    public async Task InvokeAsync_InTesting_WithAdminBearerToken_SetsIsAdminTrue()
    {
        // Arrange : bypass réservé aux tests d'intégration/E2E qui forgent ce Bearer statique
        var cookieAuth = Substitute.For<ICookieAuthService>();
        cookieAuth.TryResolvePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>())
            .Returns((PlayerAuthResolution?)null);

        var middleware = new PlayerAuthMiddleware(_ => Task.CompletedTask, CreateEnv("Testing"));
        var httpContext = CreateHttpContext("/api/admin/tracks");
        httpContext.Request.Headers.Authorization = "Bearer admin-token";

        // Act
        await middleware.InvokeAsync(httpContext, cookieAuth);

        // Assert
        httpContext.GetPlayerIsAdmin().Should().BeTrue();
    }

    [Fact]
    public async Task InvokeAsync_OutsideTesting_WithAdminBearerToken_DoesNotSetIsAdmin()
    {
        // Arrange : le bypass ne doit jamais s'activer hors Testing
        var cookieAuth = Substitute.For<ICookieAuthService>();
        cookieAuth.TryResolvePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>())
            .Returns((PlayerAuthResolution?)null);

        var middleware = new PlayerAuthMiddleware(_ => Task.CompletedTask, CreateEnv(Environments.Production));
        var httpContext = CreateHttpContext("/api/admin/tracks");
        httpContext.Request.Headers.Authorization = "Bearer admin-token";

        // Act
        await middleware.InvokeAsync(httpContext, cookieAuth);

        // Assert
        httpContext.GetPlayerIsAdmin().Should().BeFalse();
    }

    [Fact]
    public async Task GetPlayerId_WhenPlayerIdInItems_ReturnsCorrectId()
    {
        // Arrange
        var expectedId = Guid.NewGuid();
        var httpContext = CreateHttpContext("/api/sessions");
        httpContext.Items[PlayerHttpContextExtensions.PlayerIdKey] = expectedId;

        // Act
        var result = httpContext.GetPlayerId();

        // Assert
        result.Should().Be(expectedId);
    }

    [Fact]
    public void GetPlayerId_WhenPlayerIdMissing_Throws()
    {
        // Arrange
        var httpContext = CreateHttpContext("/api/sessions");

        // Act
        var act = () => httpContext.GetPlayerId();

        // Assert
        act.Should().Throw<InvalidOperationException>();
    }
}
