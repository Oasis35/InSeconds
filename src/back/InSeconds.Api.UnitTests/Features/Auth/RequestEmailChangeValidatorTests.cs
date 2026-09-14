using FluentAssertions;
using Xunit;
using InSeconds.Api.Features.Auth.RequestEmailChange;

namespace InSeconds.Api.UnitTests.Features.Auth;

public sealed class RequestEmailChangeValidatorTests
{
    private static readonly RequestEmailChangeValidator Validator = new();

    private static RequestEmailChangeCommand Command(string email) =>
        new(Guid.NewGuid(), email);

    [Fact]
    public void Validate_EmailBienForme_IsValid()
    {
        var result = Validator.Validate(Command("nouveau@example.com"));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_EmailVide_IsInvalid()
    {
        var result = Validator.Validate(Command(""));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_FormatInvalide_IsInvalid()
    {
        var result = Validator.Validate(Command("pas-un-email"));
        result.IsValid.Should().BeFalse();
    }

    // Régression : sans MaximumLength(256), un email syntaxiquement valide mais plus long que
    // la colonne EmailChangeTokens.NewEmail (HasMaxLength(256)) passait la validation puis
    // faisait planter SaveChangesAsync (DbUpdateException Postgres non catchée).
    [Fact]
    public void Validate_EmailPlusLongQue256Caracteres_IsInvalid()
    {
        var localPart = new string('a', 250);
        var tropLong = $"{localPart}@example.com";
        tropLong.Length.Should().BeGreaterThan(256);

        var result = Validator.Validate(Command(tropLong));

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_EmailDe256Caracteres_IsValid()
    {
        var domain = "@example.com";
        var localPart = new string('a', 256 - domain.Length);
        var email = $"{localPart}{domain}";
        email.Length.Should().Be(256);

        var result = Validator.Validate(Command(email));

        result.IsValid.Should().BeTrue();
    }
}
