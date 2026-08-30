using FluentValidation;

namespace InSeconds.Api.Features.Auth.DevLogin;

public sealed class DevLoginValidator : AbstractValidator<DevLoginCommand>
{
    public DevLoginValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}
