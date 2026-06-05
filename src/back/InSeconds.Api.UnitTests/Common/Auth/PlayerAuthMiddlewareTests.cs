using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Auth;
using Microsoft.AspNetCore.Http;
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

    [Fact]
    public async Task InvokeAsync_OnPlayerRoute_ResolvesPlayerAndStoresInItems()
    {
        // Arrange
        var expectedId = Guid.NewGuid();
        var cookieAuth = Substitute.For<ICookieAuthService>();
        cookieAuth.ResolveOrCreatePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>())
            .Returns(expectedId);

        var middleware = new PlayerAuthMiddleware(_ => Task.CompletedTask);
        var httpContext = CreateHttpContext("/api/sessions");

        // Act
        await middleware.InvokeAsync(httpContext, cookieAuth);

        // Assert
        httpContext.Items[PlayerHttpContextExtensions.PlayerIdKey].Should().Be(expectedId);
        await cookieAuth.Received(1).ResolveOrCreatePlayerAsync(httpContext, Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("/api/admin/login")]
    [InlineData("/api/admin/challenges")]
    [InlineData("/health")]
    public async Task InvokeAsync_OnSkippedRoute_DoesNotCallCookieAuth(string path)
    {
        // Arrange
        var cookieAuth = Substitute.For<ICookieAuthService>();
        var middleware = new PlayerAuthMiddleware(_ => Task.CompletedTask);
        var httpContext = CreateHttpContext(path);

        // Act
        await middleware.InvokeAsync(httpContext, cookieAuth);

        // Assert
        await cookieAuth.DidNotReceive().ResolveOrCreatePlayerAsync(Arg.Any<HttpContext>(), Arg.Any<CancellationToken>());
        httpContext.Items.Should().NotContainKey(PlayerHttpContextExtensions.PlayerIdKey);
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
