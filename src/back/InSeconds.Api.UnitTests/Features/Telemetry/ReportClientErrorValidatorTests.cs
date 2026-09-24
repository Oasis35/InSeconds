using FluentAssertions;
using InSeconds.Api.Features.Telemetry.ReportClientError;
using Xunit;

namespace InSeconds.Api.UnitTests.Features.Telemetry;

public sealed class ReportClientErrorValidatorTests
{
    private static readonly ReportClientErrorValidator Validator = new();

    private static ReportClientErrorCommand Command(
        string source = "js", string message = "TypeError: x is undefined", string? stack = null,
        string? url = "/", int? httpStatus = null, string? relatedTraceId = null) =>
        new(source, message, stack, url, httpStatus, relatedTraceId);

    [Theory]
    [InlineData("js")]
    [InlineData("http")]
    public void Validate_SourceConnue_IsValid(string source) =>
        Validator.Validate(Command(source: source)).IsValid.Should().BeTrue();

    [Fact]
    public void Validate_SourceInconnue_IsInvalid() =>
        Validator.Validate(Command(source: "autre")).IsValid.Should().BeFalse();

    [Fact]
    public void Validate_MessageVide_IsInvalid() =>
        Validator.Validate(Command(message: "")).IsValid.Should().BeFalse();

    // Endpoint public : bornes strictes pour qu'un client ne puisse pas injecter des logs géants.
    [Fact]
    public void Validate_MessageTropLong_IsInvalid() =>
        Validator.Validate(Command(message: new string('x', 1001))).IsValid.Should().BeFalse();

    [Fact]
    public void Validate_StackTropLongue_IsInvalid() =>
        Validator.Validate(Command(stack: new string('x', 8001))).IsValid.Should().BeFalse();

    [Fact]
    public void Validate_UrlTropLongue_IsInvalid() =>
        Validator.Validate(Command(url: new string('x', 501))).IsValid.Should().BeFalse();

    [Theory]
    [InlineData(0)]
    [InlineData(500)]
    public void Validate_StatutHttpPlausible_IsValid(int status) =>
        Validator.Validate(Command(source: "http", httpStatus: status)).IsValid.Should().BeTrue();

    [Fact]
    public void Validate_StatutHttpHorsBornes_IsInvalid() =>
        Validator.Validate(Command(source: "http", httpStatus: 700)).IsValid.Should().BeFalse();

    [Fact]
    public void Validate_TraceLieeTropLongue_IsInvalid() =>
        Validator.Validate(Command(relatedTraceId: new string('a', 65))).IsValid.Should().BeFalse();
}
