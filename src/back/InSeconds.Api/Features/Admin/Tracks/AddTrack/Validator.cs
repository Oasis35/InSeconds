using FluentValidation;

namespace InSeconds.Api.Features.Admin.Tracks.AddTrack;

public sealed class AddTrackValidator : AbstractValidator<AddTrackCommand>
{
    public AddTrackValidator()
    {
        RuleFor(x => x.DeezerTrackId).GreaterThan(0);
    }
}
