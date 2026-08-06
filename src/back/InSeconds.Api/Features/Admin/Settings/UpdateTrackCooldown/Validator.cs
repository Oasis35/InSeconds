using FluentValidation;

namespace InSeconds.Api.Features.Admin.Settings.UpdateTrackCooldown;

public sealed class UpdateTrackCooldownValidator : AbstractValidator<UpdateTrackCooldownCommand>
{
    public UpdateTrackCooldownValidator()
    {
        RuleFor(x => x.TrackCooldownDays).GreaterThan(0);
    }
}
