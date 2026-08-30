using FluentValidation;

namespace InSeconds.Api.Features.Auth.RequestMagicLink;

public sealed class RequestMagicLinkValidator : AbstractValidator<RequestMagicLinkCommand>
{
    public RequestMagicLinkValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}
