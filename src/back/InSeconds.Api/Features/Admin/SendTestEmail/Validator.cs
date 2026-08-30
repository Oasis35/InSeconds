using FluentValidation;

namespace InSeconds.Api.Features.Admin.SendTestEmail;

public sealed class SendTestEmailValidator : AbstractValidator<SendTestEmailCommand>
{
    public SendTestEmailValidator()
    {
        RuleFor(x => x.ToEmail).NotEmpty().EmailAddress();
    }
}
