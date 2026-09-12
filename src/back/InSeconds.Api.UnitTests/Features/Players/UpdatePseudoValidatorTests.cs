using FluentAssertions;
using Xunit;
using InSeconds.Api.Features.Players.UpdatePseudo;

namespace InSeconds.Api.UnitTests.Features.Players;

// Handle() dépend d'EF Core (lookup + catch de violation de contrainte unique) — couverture
// complète déléguée aux tests d'intégration (UpdatePseudoTests, contre une vraie base
// PostgreSQL). Le validator (même allowlist que VerifyMagicLinkValidator) reste testable ici.
public sealed class UpdatePseudoValidatorTests
{
    private static readonly UpdatePseudoValidator Validator = new();

    [Theory]
    [InlineData("abc")]
    [InlineData("Joueur42")]
    [InlineData("Jean-Pierre")]
    [InlineData("A.B_C 12")]
    [InlineData("vingt-caracteres-ok.")] // 20 caractères pile
    public void Validate_WhenWellFormed_IsValid(string pseudo)
    {
        var result = Validator.Validate(new UpdatePseudoCommand(Guid.NewGuid(), pseudo));
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("ab")] // trop court (< 3)
    [InlineData("")] // vide
    [InlineData("un-pseudo-beaucoup-trop-long-pour-la-regle")] // > 20 caractères
    [InlineData("invalide!")] // caractère interdit
    [InlineData("<script>")] // tentative d'injection
    public void Validate_WhenMalformed_IsInvalid(string pseudo)
    {
        var result = Validator.Validate(new UpdatePseudoCommand(Guid.NewGuid(), pseudo));
        result.IsValid.Should().BeFalse();
    }
}
