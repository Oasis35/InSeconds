using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Auth;
using InSeconds.Api.Features.Admin.Login;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace InSeconds.Api.UnitTests.Features.Admin;

public sealed class LoginHandlerTests
{
    // Fausse implémentation minimale : ce test ne vérifie pas le comportement de
    // AdminTokenStore lui-même (cf. AdminTokenStoreTests), juste que Handle délègue
    // bien l'émission du token au store plutôt que de renvoyer une constante.
    private sealed class FakeAdminTokenStore : IAdminTokenStore
    {
        public string? IssuedToken { get; private set; }

        public string IssueToken()
        {
            IssuedToken = "fake-token";
            return IssuedToken;
        }

        public bool IsValid(string token) => token == IssuedToken;

        public void Revoke(string token) { }
    }

    private static LoginHandler CreateHandler(string? configuredPassword, IAdminTokenStore? tokenStore = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(configuredPassword is not null
                ? new Dictionary<string, string?> { ["AdminPassword"] = configuredPassword }
                : new Dictionary<string, string?>())
            .Build();
        return new LoginHandler(config, tokenStore ?? new FakeAdminTokenStore());
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
    public async Task Handle_WhenPasswordMatches_IssuesTokenFromStore()
    {
        var tokenStore = new FakeAdminTokenStore();
        var handler = CreateHandler("secret123", tokenStore);

        await handler.Handle(new LoginCommand("secret123"), CancellationToken.None);

        tokenStore.IssuedToken.Should().Be("fake-token");
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
