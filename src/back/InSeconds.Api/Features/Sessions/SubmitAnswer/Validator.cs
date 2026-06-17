using FluentValidation;
using InSeconds.Api.Common.Settings;

namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public sealed class SubmitAnswerValidator : AbstractValidator<SubmitAnswerCommand>
{
    public SubmitAnswerValidator(SettingsService settingsService)
    {
        var settings = settingsService.GetAsync().GetAwaiter().GetResult();

        RuleFor(x => x.SessionId).GreaterThan(0);
        RuleFor(x => x.DailyChallengeTrackId).GreaterThan(0);
        RuleFor(x => x.ListenedDurationSeconds)
            .Must(d => d == 0 || settings.AllowedDurationsSeconds.Contains(d))
            .WithMessage($"La durée doit être 0 ou l'un des paliers autorisés : {string.Join(", ", settings.AllowedDurationsSeconds)}s.");
        RuleFor(x => x.ArtistAnswer).MaximumLength(200).When(x => x.ArtistAnswer is not null);
        RuleFor(x => x.TitleAnswer).MaximumLength(300).When(x => x.TitleAnswer is not null);
    }
}
