using FluentAssertions;
using Xunit;
using InSeconds.Api.Features.Admin.Login;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace InSeconds.Api.UnitTests.Features.Admin;

public sealed class LoginHandlerTests
{
    private static LoginHandler CreateHandler(string? configuredPassword)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(configuredPassword is not null
                ? new Dictionary<string, string?> { ["AdminPassword"] = configuredPassword }
                : new Dictionary<string, string?>())
            .Build();
        return new LoginHandler(config);
    }

    [Fact]
    public async Task Handle_WhenPasswordMatches_Returns200()
    {
        var handler = CreateHandler("secret123");

        var result = await handler.Handle(new LoginCommand("secret123"), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status200OK);
    }

    [Fact]
    public async Task Handle_WhenPasswordDoesNotMatch_Returns401()
    {
        var handler = CreateHandler("secret123");

        var result = await handler.Handle(new LoginCommand("mauvais"), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
    }

    [Fact]
    public async Task Handle_WhenAdminPasswordNotConfigured_Returns401()
    {
        var handler = CreateHandler(null);

        var result = await handler.Handle(new LoginCommand("n'importe quoi"), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
    }

    [Fact]
    public async Task Handle_WhenPasswordIsEmpty_Returns401()
    {
        var handler = CreateHandler("secret123");

        var result = await handler.Handle(new LoginCommand(""), CancellationToken.None);

        result.Should().BeAssignableTo<IStatusCodeHttpResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
    }
}
