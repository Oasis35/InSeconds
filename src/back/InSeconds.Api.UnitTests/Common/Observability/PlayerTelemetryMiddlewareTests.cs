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
    public async Task InvokeAsync_CompteConnecte_AjouteLePseudoALaTraceEtAuScope()
    {
        var logger = new CapturingLogger<PlayerTelemetryMiddleware>();
        var context = new DefaultHttpContext();
        context.Items[PlayerHttpContextExtensions.PlayerIdKey] = PlayerId;
        context.Items[PlayerHttpContextExtensions.PseudoKey] = "Clem";
        var middleware = new PlayerTelemetryMiddleware(_ => Task.CompletedTask, logger);

        using var activity = new Activity("test").Start();
        await middleware.InvokeAsync(context);

        activity.GetTagItem(PlayerTelemetryMiddleware.PlayerPseudoTag).Should().Be("Clem");
        var scope = logger.Scopes.Should().ContainSingle()
            .Which.Should().BeAssignableTo<IDictionary<string, object>>().Subject;
        scope["PlayerId"].Should().Be(PlayerId);
        scope["PlayerPseudo"].Should().Be("Clem");
    }

    [Fact]
    public async Task InvokeAsync_Invite_PasDePseudo()
    {
        var logger = new CapturingLogger<PlayerTelemetryMiddleware>();
        var context = new DefaultHttpContext();
        context.Items[PlayerHttpContextExtensions.PlayerIdKey] = PlayerId;
        var middleware = new PlayerTelemetryMiddleware(_ => Task.CompletedTask, logger);

        using var activity = new Activity("test").Start();
        await middleware.InvokeAsync(context);

        activity.GetTagItem(PlayerTelemetryMiddleware.PlayerPseudoTag).Should().BeNull();
        logger.Scopes.Should().ContainSingle()
            .Which.Should().BeAssignableTo<IDictionary<string, object>>()
            .Which.Should().NotContainKey("PlayerPseudo");
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
