using FluentValidation;

namespace InSeconds.Api.Features.Auth.RequestMagicLink;

public sealed class RequestMagicLinkValidator : AbstractValidator<RequestMagicLinkCommand>
{
    public RequestMagicLinkValidator()
    {
        // MaximumLength alignée sur MagicLinkTokenConfiguration.Email (HasMaxLength(256)) : sans
        // elle, un email syntaxiquement valide mais trop long passe FluentValidation puis fait
        // planter SaveChangesAsync (DbUpdateException Postgres, non catchée) sur un endpoint
        // public non authentifié.
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
    }
}
