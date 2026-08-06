using FluentAssertions;
using Xunit;
using InSeconds.Api.Features.Admin.Settings.UpdateTrackCooldown;

namespace InSeconds.Api.UnitTests.Features.Admin.Settings;

// Handle() utilise ExecuteUpdateAsync, non supporté par le provider EF Core InMemory —
// couverture du handler complet (update + 404) déléguée aux tests d'intégration
// (UpdateTrackCooldownTests, contre une vraie base PostgreSQL). Le validator reste testable ici.
public sealed class UpdateTrackCooldownValidatorTests
{
    private static readonly UpdateTrackCooldownValidator Validator = new();

    [Theory]
    [InlineData(1)]
    [InlineData(30)]
    [InlineData(365)]
    public void Validate_WhenPositive_IsValid(int days)
    {
        var result = Validator.Validate(new UpdateTrackCooldownCommand(days));
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Validate_WhenNotPositive_IsInvalid(int days)
    {
        var result = Validator.Validate(new UpdateTrackCooldownCommand(days));
        result.IsValid.Should().BeFalse();
    }
}
