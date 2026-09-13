using FluentAssertions;
using Xunit;
using InSeconds.Api.Features.Auth.RequestMagicLink;

namespace InSeconds.Api.UnitTests.Features.Auth;

public sealed class RequestMagicLinkValidatorTests
{
    private static readonly RequestMagicLinkValidator Validator = new();

    [Fact]
    public void Validate_EmailBienForme_IsValid()
    {
        var result = Validator.Validate(new RequestMagicLinkCommand("joueur@example.com"));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_EmailVide_IsInvalid()
    {
        var result = Validator.Validate(new RequestMagicLinkCommand(""));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_FormatInvalide_IsInvalid()
    {
        var result = Validator.Validate(new RequestMagicLinkCommand("pas-un-email"));
        result.IsValid.Should().BeFalse();
    }

    // Régression : sans MaximumLength(256), un email syntaxiquement valide mais plus long que
    // la colonne MagicLinkTokens.Email (HasMaxLength(256)) passait la validation puis faisait
    // planter SaveChangesAsync (DbUpdateException Postgres non catchée) sur cet endpoint public.
    [Fact]
    public void Validate_EmailPlusLongQue256Caracteres_IsInvalid()
    {
        var localPart = new string('a', 250);
        var tropLong = $"{localPart}@example.com";
        tropLong.Length.Should().BeGreaterThan(256);

        var result = Validator.Validate(new RequestMagicLinkCommand(tropLong));

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_EmailDe256Caracteres_IsValid()
    {
        // 256 caractères pile : la limite ne doit pas être off-by-one.
        var domain = "@example.com";
        var localPart = new string('a', 256 - domain.Length);
        var email = $"{localPart}{domain}";
        email.Length.Should().Be(256);

        var result = Validator.Validate(new RequestMagicLinkCommand(email));

        result.IsValid.Should().BeTrue();
    }
}
