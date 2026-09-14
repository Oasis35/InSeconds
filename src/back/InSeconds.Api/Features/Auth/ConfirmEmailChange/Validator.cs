using FluentValidation;

namespace InSeconds.Api.Features.Auth.ConfirmEmailChange;

public sealed class ConfirmEmailChangeValidator : AbstractValidator<ConfirmEmailChangeCommand>
{
    public ConfirmEmailChangeValidator()
    {
        RuleFor(x => x.Token).NotEmpty();
    }
}
