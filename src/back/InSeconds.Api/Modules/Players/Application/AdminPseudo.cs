using System.Security.Cryptography;
using InSeconds.Api.Infrastructure.Errors;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

/// <summary>Le pseudo que le joueur porte après la remise à zéro ; vide pour un invité (son pseudo est simplement retiré).</summary>
public sealed record ResetPseudoResponse(string? Pseudo);

/// <summary>Le joueur visé par la modération, son compte s'il en a un, et l'admin qui l'a demandée.</summary>
public sealed record PseudoModeration(Guid AdminId, Player? Player, Account? Account, string? Replacement);

/// <summary>Le pseudo de remplacement d'un compte dont le pseudo est inapproprié : « Joueur » et un nombre, toujours valide (3 à 20 caractères permis).</summary>
internal static class PseudoReplacement
{
    private const int Attempts = 10;

    public static async Task<string?> NewAsync(IPlayerStore store, CancellationToken ct)
    {
        for (var attempt = 0; attempt < Attempts; attempt++)
        {
            var candidate = $"Joueur{RandomNumberGenerator.GetInt32(1000, 100000)}";
            if (!await store.IsPseudoTakenAsync(candidate, ct))
                return candidate;
        }

        return null;
    }
}

public static class ResetPseudoEndpoint
{
    public static async Task<PseudoModeration> LoadAsync(Guid playerId, ICurrentPlayer current, IPlayerStore store, CancellationToken ct)
    {
        var player = await store.FindPlayerAsync(playerId, ct);
        var account = player is null ? null : await store.FindAccountAsync(playerId, ct);
        var replacement = account is null ? null : await PseudoReplacement.NewAsync(store, ct);
        return new PseudoModeration(current.PlayerId!.Value, player, account, replacement);
    }

    public static ProblemDetails Validate(PseudoModeration moderation) =>
        moderation.Player is null ? ApiProblem.Of(StatusCodes.Status404NotFound, ErrorCodes.NotFound, "Joueur introuvable.") : WolverineContinue.NoProblems;

    /// <summary>
    /// <c>POST /api/admin/accounts/{playerId}/pseudo/reset</c> : remet à zéro un pseudo inapproprié. Un compte reçoit un pseudo de remplacement
    /// (« Joueur4821 », libre) ; le pseudo d'un invité est simplement retiré. Le joueur le change ensuite à sa guise (profil). 404
    /// <c>common.not_found</c> pour un joueur inconnu.
    /// </summary>
    [WolverinePost("/api/admin/accounts/{playerId}/pseudo/reset", OperationId = "resetPlayerPseudo")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public static ResetPseudoResponse Post([NotBody] PseudoModeration moderation, ILogger<Account> logger)
    {
        if (moderation.Account is { } account)
        {
            account.Rename(moderation.Replacement ?? throw new InvalidOperationException("Aucun pseudo de remplacement libre après plusieurs tirages."));
            PlayersLog.PseudoReset(logger, account.PlayerId, moderation.AdminId);
            return new ResetPseudoResponse(account.Pseudo);
        }

        moderation.Player!.SetGuestPseudo(null);
        PlayersLog.PseudoReset(logger, moderation.Player.Id, moderation.AdminId);
        return new ResetPseudoResponse(null);
    }
}
