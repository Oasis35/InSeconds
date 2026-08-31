using FluentValidation;

namespace InSeconds.Api.Features.Auth.VerifyMagicLink;

// Allowlist de caractères sur Pseudo plutôt qu'un filtre de mots interdits : bloque
// par construction toute syntaxe d'injection (<, >, ', ", ;, retours à la ligne...),
// pas seulement les cas auxquels on aurait pensé (cf. plan — "Sécurité des saisies").
public sealed class VerifyMagicLinkValidator : AbstractValidator<VerifyMagicLinkCommand>
{
    public VerifyMagicLinkValidator()
    {
        RuleFor(x => x.Token).NotEmpty();

        RuleFor(x => x.Pseudo)
            .Matches(@"^[\p{L}\p{N} _.-]{3,20}$")
            .When(x => x.Pseudo is not null)
            .WithMessage("Le pseudo doit faire 3 à 20 caractères (lettres, chiffres, espace, _, . ou -).");
    }
}
