using FluentValidation;

namespace InSeconds.Api.Features.Admin.Tracks.RenameTrack;

public sealed class RenameTrackValidator : AbstractValidator<RenameTrackCommand>
{
    public RenameTrackValidator()
    {
        // Mêmes longueurs max que TrackConfiguration.
        RuleFor(x => x.Artist).Must(a => !string.IsNullOrWhiteSpace(a)).MaximumLength(200);
        RuleFor(x => x.Title).Must(t => !string.IsNullOrWhiteSpace(t)).MaximumLength(300);
    }
}
