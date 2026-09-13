using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Auth;
using Microsoft.Extensions.Hosting;
using NSubstitute;

namespace InSeconds.Api.UnitTests.Common.Auth;

public sealed class AdminTokenStoreTests
{
    private static AdminTokenStore CreateStore(string environmentName)
    {
        var env = Substitute.For<IHostEnvironment>();
        env.EnvironmentName.Returns(environmentName);
        return new AdminTokenStore(env);
    }

    [Fact]
    public void IssueToken_EnDevOuProd_GenereUnTokenAleatoireDistinctAChaqueAppel()
    {
        var store = CreateStore(Environments.Production);

        var token1 = store.IssueToken();
        var token2 = store.IssueToken();

        token1.Should().NotBe(token2);
        store.IsValid(token1).Should().BeTrue();
        store.IsValid(token2).Should().BeTrue();
    }

    [Fact]
    public void IsValid_TokenJamaisEmis_False()
    {
        var store = CreateStore(Environments.Production);

        store.IsValid("un-token-invente").Should().BeFalse();
    }

    [Fact]
    public void Revoke_TokenEmis_NestPlusValideEnsuite()
    {
        var store = CreateStore(Environments.Production);
        var token = store.IssueToken();

        store.Revoke(token);

        store.IsValid(token).Should().BeFalse();
    }

    [Fact]
    public void EnTesting_IssueToken_RetourneToujoursLeMemeTokenFixe()
    {
        // Les fixtures E2E/tests d'intégration envoient directement "Bearer admin-token"
        // sans passer par un vrai login — cf. IntegrationTestFactory, e2e/fixtures/api-client.ts.
        var store = CreateStore("Testing");

        var token = store.IssueToken();

        token.Should().Be("admin-token");
        store.IsValid("admin-token").Should().BeTrue();
    }

    [Fact]
    public void EnTesting_Revoke_NinvalideJamaisLeTokenFixe()
    {
        var store = CreateStore("Testing");

        store.Revoke("admin-token");

        store.IsValid("admin-token").Should().BeTrue();
    }
}
