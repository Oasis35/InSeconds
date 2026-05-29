using FluentValidation;

namespace InSeconds.Api.Features.Sessions.SubmitAnswer;

public sealed class SubmitAnswerValidator : AbstractValidator<SubmitAnswerCommand>
{
    private static readonly int[] AllowedDurations = [1, 2, 3, 5, 10, 15, 30];

    public SubmitAnswerValidator()
    {
        RuleFor(x => x.SessionId).GreaterThan(0);
        RuleFor(x => x.DailyChallengeTrackId).GreaterThan(0);
        RuleFor(x => x.ListenedDurationSeconds)
            .Must(d => AllowedDurations.Contains(d))
            .WithMessage($"La durée doit être l'un des paliers autorisés : {string.Join(", ", AllowedDurations)}s.");
        RuleFor(x => x.ArtistAnswer).MaximumLength(200).When(x => x.ArtistAnswer is not null);
        RuleFor(x => x.TitleAnswer).MaximumLength(300).When(x => x.TitleAnswer is not null);
    }
}
