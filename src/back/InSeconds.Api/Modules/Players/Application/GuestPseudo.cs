using FluentValidation;
using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

public sealed record SetGuestPseudo(string Pseudo);

public sealed class SetGuestPseudoValidator : AbstractValidator<SetGuestPseudo>
{
    public SetGuestPseudoValidator() =>
        RuleFor(x => x.Pseudo)
            .Must(p => p is not null && System.Text.RegularExpressions.Regex.IsMatch(p.Trim(), VerifyMagicLinkValidator.PseudoPattern))
            .WithMessage("Le pseudo doit faire 3 à 20 caractères (lettres, chiffres, espace, _, . ou -).");
}

/// <summary>Le joueur de la requête et la présence d'un compte (qui a son propre pseudo).</summary>
public sealed record GuestLoad(Player? Player, bool HasAccount);

public static class SetGuestPseudoEndpoint
{
    public static async Task<GuestLoad> LoadAsync(ICurrentPlayer current, IPlayerStore store, CancellationToken ct)
    {
        if (current.PlayerId is not { } playerId)
            return new GuestLoad(null, false);
        return new GuestLoad(await store.FindPlayerAsync(playerId, ct), await store.HasAccountAsync(playerId, ct));
    }

    public static async Task<ProblemDetails> ValidateAsync(SetGuestPseudo request, GuestLoad load, IPlayerStore store, CancellationToken ct)
    {
        if (load.Player is null)
            return PlayersProblems.GuestForbidden();
        if (load.HasAccount)
            return PlayersProblems.NotAGuest();
        // Les comptes ont la priorité sur les pseudos : un invité ne prend jamais celui d'un compte (comparaison sans casse). Entre invités, aucune
        // unicité (la comparaison d'une playlist distingue deux homonymes par un repère).
        return await store.IsPseudoTakenAsync(request.Pseudo.Trim(), ct) ? PlayersProblems.PseudoTaken() : WolverineContinue.NoProblems;
    }

    /// <summary>
    /// <c>PUT /api/players/me/guest-pseudo</c> : un invité se donne (ou change) son pseudo, retrouvé à chaque visite par son navigateur. 409
    /// <c>players.pseudo_taken</c> pour le pseudo d'un compte, 409 <c>players.not_a_guest</c> pour un compte (son pseudo se change dans le
    /// profil).
    /// </summary>
    [Authorize]
    [WolverinePut("/api/players/me/guest-pseudo", OperationId = "setGuestPseudo")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public static PseudoResponse Put(SetGuestPseudo request, GuestLoad load)
    {
        var pseudo = request.Pseudo.Trim();
        load.Player!.SetGuestPseudo(pseudo);
        return new PseudoResponse(pseudo);
    }
}
