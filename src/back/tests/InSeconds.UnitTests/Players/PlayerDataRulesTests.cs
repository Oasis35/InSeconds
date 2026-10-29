using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Players.Auth;
using InSeconds.Api.Modules.Players.Domain;
using Wolverine.Http;

namespace InSeconds.UnitTests.Players;

/// <summary>Droits RGPD du joueur : la confirmation de la suppression, les durées de conservation, les commandes de secours.</summary>
public class PlayerDataRulesTests
{
    private static readonly Account Alice = Account.Create(Guid.NewGuid(), "alice@example.com", "Alice", DateTimeOffset.UnixEpoch);

    [Theory]
    [InlineData("Alice")]
    [InlineData("alice")]
    [InlineData("  ALICE ")]
    public void Suppression_PseudoRetape_SansCasseNiEspaces(string pseudo) =>
        Assert.Same(WolverineContinue.NoProblems, DeleteMyAccountEndpoint.Validate(new DeleteMyAccount(pseudo), Alice));

    [Theory]
    [InlineData("Alic")]
    [InlineData("Alicé")]
    [InlineData("Bob")]
    public void Suppression_AutrePseudo_Refusee(string pseudo) =>
        Assert.Equal(PlayersErrorCodes.PseudoMismatch, DeleteMyAccountEndpoint.Validate(new DeleteMyAccount(pseudo), Alice).Extensions["code"]);

    [Fact]
    public void Suppression_Invite_Refusee() =>
        Assert.Equal(PlayersErrorCodes.GuestForbidden, DeleteMyAccountEndpoint.Validate(new DeleteMyAccount("Alice"), null).Extensions["code"]);

    [Fact]
    public void Suppression_PseudoVide_RefuseParLaValidation() =>
        Assert.False(new DeleteMyAccountValidator().Validate(new DeleteMyAccount("")).IsValid);

    [Fact]
    public void Conservation_UnAppareilNEstJamaisSupprimeAvantLaFinDeSonCookie() =>
        Assert.True(PlayerRetention.StaleDevice > AuthSetup.CookieLifetime);

    [Fact]
    public void Conservation_ComptesInactifs_3Ans() =>
        Assert.Equal(TimeSpan.FromDays(1095), PlayerRetention.InactiveAccount);

    [Theory]
    [InlineData(new[] { "--export-player", "a@b.fr" }, true)]
    [InlineData(new[] { "--delete-player", "a@b.fr" }, true)]
    [InlineData(new[] { "--migrate-only" }, false)]
    [InlineData(new string[0], false)]
    public void Commandes_Reconnues(string[] args, bool requested) =>
        Assert.Equal(requested, PlayerDataCommand.IsRequested(args));
}
