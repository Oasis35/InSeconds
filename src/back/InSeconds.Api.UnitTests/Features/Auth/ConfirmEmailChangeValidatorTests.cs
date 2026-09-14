using FluentAssertions;
using Xunit;
using InSeconds.Api.Features.Auth.ConfirmEmailChange;

namespace InSeconds.Api.UnitTests.Features.Auth;

public sealed class ConfirmEmailChangeValidatorTests
{
    private static readonly ConfirmEmailChangeValidator Validator = new();

    [Fact]
    public void Validate_TokenNonVide_IsValid()
    {
        var result = Validator.Validate(new ConfirmEmailChangeCommand("un-token"));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_TokenVide_IsInvalid()
    {
        var result = Validator.Validate(new ConfirmEmailChangeCommand(""));
        result.IsValid.Should().BeFalse();
    }
}
