using FluentValidation;
using InSeconds.Api.Common.Settings;

namespace InSeconds.Api.Features.Sessions.UpdateListening;

public sealed class UpdateListeningValidator : AbstractValidator<UpdateListeningCommand>
{
    public UpdateListeningValidator(SettingsService settingsService)
    {
        var settings = settingsService.GetAsync().GetAwaiter().GetResult();

        RuleFor(x => x.SessionId).GreaterThan(0);
        RuleFor(x => x.TrackId).GreaterThan(0);
        RuleFor(x => x.ListenedSeconds)
            .Must(d => settings.AllowedDurationsSeconds.Contains(d))
            .WithMessage($"La durée doit être l'un des paliers autorisés : {string.Join(", ", settings.AllowedDurationsSeconds)}s.");
    }
}
