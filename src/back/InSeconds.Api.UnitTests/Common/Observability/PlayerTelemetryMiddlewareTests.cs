using System.Diagnostics;
using FluentAssertions;
using InSeconds.Api.Common.Auth;
using InSeconds.Api.Common.Observability;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Observability;

public sealed class PlayerTelemetryMiddlewareTests
{
    private static readonly Guid PlayerId = new("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task InvokeAsync_JoueurResolu_TagueLaTraceEtOuvreUnScopePlayerId()
    {
        var logger = new CapturingLogger<PlayerTelemetryMiddleware>();
        var context = new DefaultHttpContext();
        context.Items[PlayerHttpContextExtensions.PlayerIdKey] = PlayerId;
        var nextCalled = false;
        var middleware = new PlayerTelemetryMiddleware(_ => { nextCalled = true; return Task.CompletedTask; }, logger);

        using var activity = new Activity("test").Start();
        await middleware.InvokeAsync(context);

        nextCalled.Should().BeTrue();
        activity.GetTagItem(PlayerTelemetryMiddleware.PlayerIdTag).Should().Be(PlayerId.ToString());
        logger.Scopes.Should().ContainSingle()
            .Which.Should().BeAssignableTo<IDictionary<string, object>>()
            .Which["PlayerId"].Should().Be(PlayerId);
    }

    [Fact]
    public async Task InvokeAsync_VisiteurSansJoueur_NeTagueRien()
    {
        var logger = new CapturingLogger<PlayerTelemetryMiddleware>();
        var context = new DefaultHttpContext();
        var nextCalled = false;
        var middleware = new PlayerTelemetryMiddleware(_ => { nextCalled = true; return Task.CompletedTask; }, logger);

        using var activity = new Activity("test").Start();
        await middleware.InvokeAsync(context);

        nextCalled.Should().BeTrue();
        activity.GetTagItem(PlayerTelemetryMiddleware.PlayerIdTag).Should().BeNull();
        logger.Scopes.Should().BeEmpty();
    }
}
