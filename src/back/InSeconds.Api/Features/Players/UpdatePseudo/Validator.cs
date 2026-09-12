using FluentValidation;

namespace InSeconds.Api.Features.Players.UpdatePseudo;

// Même allowlist que VerifyMagicLink/Validator.cs (choix de pseudo à la création de
// compte) — garder les deux synchronisées si la règle évolue.
public sealed class UpdatePseudoValidator : AbstractValidator<UpdatePseudoCommand>
{
    public UpdatePseudoValidator()
    {
        RuleFor(x => x.Pseudo)
            .Matches(@"^[\p{L}\p{N} _.-]{3,20}$")
            .WithMessage("Le pseudo doit faire 3 à 20 caractères (lettres, chiffres, espace, _, . ou -).");
    }
}
