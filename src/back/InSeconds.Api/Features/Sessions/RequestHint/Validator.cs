using FluentValidation;
using InSeconds.Api.Common.Settings;

namespace InSeconds.Api.Features.Sessions.RequestHint;

public sealed class RequestHintValidator : AbstractValidator<RequestHintCommand>
{
    public RequestHintValidator(SettingsService settingsService)
    {
        var settings = settingsService.GetAsync().GetAwaiter().GetResult();
        var maxLevel = settings.HintUnlockDurationsSeconds.Length;

        RuleFor(x => x.SessionId).GreaterThan(0);
        RuleFor(x => x.DailyChallengeTrackId).GreaterThan(0);
        RuleFor(x => x.Level)
            .InclusiveBetween(1, maxLevel)
            .WithMessage($"Le niveau d'indice doit être compris entre 1 et {maxLevel}.");
    }
}
