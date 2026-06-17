using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Settings;
using InSeconds.Api.Features.Sessions.SubmitAnswer;
using Microsoft.Extensions.Options;

namespace InSeconds.Api.UnitTests.Features.Sessions.SubmitAnswer;

public sealed class SubmitAnswerValidatorTests
{
    private static readonly Guid FakePlayerId = new("11111111-1111-1111-1111-111111111111");

    private static SubmitAnswerValidator CreateValidator() =>
        new(new SettingsService(Options.Create(new AppSettings())));

    private static SubmitAnswerCommand BuildCommand(
        decimal duration          = 1,
        int sessionId             = 1,
        int dailyChallengeTrackId = 1,
        string? artist            = "Daft Punk",
        string? title             = "Get Lucky") =>
        new(FakePlayerId, sessionId, dailyChallengeTrackId, duration, false, artist, title);

    [Theory]
    [InlineData(0.50)]
    [InlineData(1)]
    [InlineData(1.5)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(5)]
    [InlineData(10)]
    public void Validate_WhenDurationIsAllowedPalier_IsValid(decimal duration)
    {
        var result = CreateValidator().Validate(BuildCommand(duration: duration));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenDurationIsZero_IsValid()
    {
        // 0 = skip (morceau sans preview)
        var result = CreateValidator().Validate(BuildCommand(duration: 0));
        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(0.1)]
    [InlineData(4)]
    [InlineData(99)]
    public void Validate_WhenDurationIsNotAllowed_IsInvalid(decimal duration)
    {
        var result = CreateValidator().Validate(BuildCommand(duration: duration));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => e.PropertyName == nameof(SubmitAnswerCommand.ListenedDurationSeconds));
    }

    [Fact]
    public void Validate_WhenSessionIdIsZero_IsInvalid()
    {
        var result = CreateValidator().Validate(BuildCommand() with { SessionId = 0 });
        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => e.PropertyName == nameof(SubmitAnswerCommand.SessionId));
    }

    [Fact]
    public void Validate_WhenDailyChallengeTrackIdIsZero_IsInvalid()
    {
        var result = CreateValidator().Validate(BuildCommand() with { DailyChallengeTrackId = 0 });
        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => e.PropertyName == nameof(SubmitAnswerCommand.DailyChallengeTrackId));
    }

    [Fact]
    public void Validate_WhenArtistAnswerTooLong_IsInvalid()
    {
        var result = CreateValidator().Validate(BuildCommand(artist: new string('a', 201)));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => e.PropertyName == nameof(SubmitAnswerCommand.ArtistAnswer));
    }

    [Fact]
    public void Validate_WhenTitleAnswerTooLong_IsInvalid()
    {
        var result = CreateValidator().Validate(BuildCommand(title: new string('a', 301)));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e => e.PropertyName == nameof(SubmitAnswerCommand.TitleAnswer));
    }

    [Fact]
    public void Validate_WhenAnswersAreNull_IsValid()
    {
        // null = skip volontaire
        var result = CreateValidator().Validate(BuildCommand(artist: null, title: null));
        result.IsValid.Should().BeTrue();
    }
}
