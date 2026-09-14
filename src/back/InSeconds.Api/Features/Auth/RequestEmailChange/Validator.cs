using FluentValidation;

namespace InSeconds.Api.Features.Auth.RequestEmailChange;

public sealed class RequestEmailChangeValidator : AbstractValidator<RequestEmailChangeCommand>
{
    public RequestEmailChangeValidator()
    {
        // MaximumLength alignée sur EmailChangeTokenConfiguration.NewEmail (HasMaxLength(256)),
        // même raison que RequestMagicLinkValidator.
        RuleFor(x => x.NewEmail).NotEmpty().EmailAddress().MaximumLength(256);
    }
}
