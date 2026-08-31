using FluentValidation;

namespace InSeconds.Api.Features.Admin.AllowedEmails.AddAllowedEmail;

public sealed class AddAllowedEmailValidator : AbstractValidator<AddAllowedEmailCommand>
{
    public AddAllowedEmailValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}
