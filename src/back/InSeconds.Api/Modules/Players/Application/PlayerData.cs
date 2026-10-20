using FluentValidation;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Players.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wolverine.Http;

namespace InSeconds.Api.Modules.Players.Application;

/// <param name="IsAdmin">Le rôle admin du compte, posé à la main (piège 5).</param>
public sealed record AccountExport(string Email, string Pseudo, DateTimeOffset? LinkedAt, bool IsAdmin);

/// <param name="Label">Navigateur et système (« Safari · iPhone »), jamais l'en-tête brut.</param>
public sealed record DeviceExport(string? Label, DateTimeOffset CreatedAt, DateTimeOffset LastSeenAt, DateTimeOffset? RevokedAt);

/// <summary>Ce que Players garde d'un joueur.</summary>
/// <param name="Account">Rien pour un invité.</param>
public sealed record PlayerRecordExport(DateTimeOffset CreatedAt, DateTimeOffset? LastSeenAt, AccountExport? Account, IReadOnlyList<DeviceExport> Devices);

/// <summary>
/// La copie de toutes les données d'un joueur (droit d'accès et portabilité, RGPD art. 15 et 20) : le téléchargement du profil et la
/// commande de secours <c>--export-player</c> rendent ce même document. <paramref name="Modules"/> a une section par mode de jeu
/// (<c>daily</c> : série et parties), fournie par son <see cref="IPlayerDataContributor"/> : Players n'en connaît aucun.
/// </summary>
public sealed record PlayerDataExport(
    DateTimeOffset ExportedAt,
    Guid PlayerId,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastSeenAt,
    AccountExport? Account,
    IReadOnlyList<DeviceExport> Devices,
    IReadOnlyDictionary<string, object> Modules);

public sealed record DeleteMyAccount(string Pseudo);

public sealed class DeleteMyAccountValidator : AbstractValidator<DeleteMyAccount>
{
    public DeleteMyAccountValidator() => RuleFor(x => x.Pseudo).NotEmpty().MaximumLength(50);
}

/// <summary>La copie des données d'un joueur, assemblée depuis Players et depuis chaque mode (par son <see cref="IPlayerDataContributor"/>).</summary>
public sealed class PlayerDataExporter(IPlayerQueries queries, IEnumerable<IPlayerDataContributor> contributors, TimeProvider time)
{
    /// <summary>Rien si le joueur n'existe pas ou a été supprimé.</summary>
    public async Task<PlayerDataExport?> ExportAsync(Guid playerId, CancellationToken ct)
    {
        if (await queries.ExportAsync(playerId, ct) is not { } player)
            return null;
        // Une section par mode, dans l'ordre d'enregistrement ; un nom en double ferait perdre des données : refusé plutôt que masqué.
        var modules = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var contributor in contributors)
            modules.Add(contributor.Module, await contributor.ExportAsync(playerId, ct));
        return new PlayerDataExport(time.GetUtcNow(), playerId, player.CreatedAt, player.LastSeenAt, player.Account, player.Devices, modules);
    }
}

/// <param name="Games">Parties supprimées, tous modes confondus.</param>
/// <param name="Devices">Appareils supprimés, révoqués compris.</param>
public sealed record ErasedPlayer(int Games, int Devices);

/// <summary>
/// L'effacement d'un joueur (droit à l'effacement, RGPD art. 17) : ses données de jeu (chaque mode, par son <see cref="IPlayerDataContributor"/>), puis tout ce que Players
/// garde de lui, ligne du joueur comprise. Rien ne reste qui le concerne, sauf son score dans les photos figées des jours passés, sans
/// rien qui y mène. Partagé par le bouton du profil, la purge des comptes inactifs et la commande de secours <c>--delete-player</c> ; dans
/// la transaction de l'appelant (celle de Wolverine pour une route ou une tâche).
/// </summary>
public sealed class AccountErasure(IPlayerStore store, IEnumerable<IPlayerDataContributor> contributors, IDeviceSessionValidationCache validationCache)
{
    public async Task<ErasedPlayer> EraseAsync(Guid playerId, CancellationToken ct)
    {
        var devices = await store.ListDeviceSessionIdsAsync(playerId, ct);
        // Les données de chaque mode d'abord : elles référencent le joueur (clé étrangère), sa ligne ne part qu'ensuite.
        var erasedGames = 0;
        foreach (var contributor in contributors)
            erasedGames += await contributor.DeleteAsync(playerId, ct);
        await store.EraseAsync(playerId, ct);
        // Ses cookies sont refusés dès la requête suivante (la session n'existe plus), pas au bout de la minute du cache.
        foreach (var id in devices)
            validationCache.Forget(playerId, id);
        return new ErasedPlayer(erasedGames, devices.Count);
    }
}

public static class ExportMyDataEndpoint
{
    /// <summary>
    /// <c>GET /api/players/me/export</c> : toutes ses données en JSON, en pièce jointe (<c>inseconds-donnees-aaaa-mm-jj.json</c>) ; invité
    /// compris, il a des parties. Jamais gardé en cache (<c>no-store</c> sur toute l'API).
    /// </summary>
    [Authorize]
    [WolverineGet("/api/players/me/export", OperationId = "exportMyData")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [NoContentIfMissing]
    public static async Task<PlayerDataExport?> Get(ICurrentPlayer current, PlayerDataExporter exporter, HttpResponse response, CancellationToken ct)
    {
        var export = await exporter.ExportAsync(current.PlayerId!.Value, ct);
        if (export is not null)
            response.Headers.ContentDisposition =
                $"attachment; filename=\"inseconds-donnees-{export.ExportedAt:yyyy-MM-dd}.json\"";
        return export;
    }
}

public static class DeleteMyAccountEndpoint
{
    public static Task<Account?> LoadAsync(ICurrentPlayer current, IPlayerStore store, CancellationToken ct) =>
        CurrentAccount.LoadAsync(current, store, ct);

    // Le pseudo retapé protège d'un clic par erreur (sans casse, comme son unicité) ; ce n'est pas un secret.
    public static ProblemDetails Validate(DeleteMyAccount request, Account? account) => account switch
    {
        null => PlayersProblems.GuestForbidden(),
        _ when !string.Equals(request.Pseudo.Trim(), account.Pseudo, StringComparison.OrdinalIgnoreCase) => PlayersProblems.PseudoMismatch(),
        _ => WolverineContinue.NoProblems,
    };

    /// <summary>
    /// <c>POST /api/players/me/delete</c> : supprime son compte pour de bon, avec son email, son pseudo, ses appareils, sa série et ses
    /// parties (<see cref="AccountErasure"/>), puis retire le cookie : le navigateur redevient celui d'un visiteur. Comptes seulement.
    /// </summary>
    [Authorize]
    [WolverinePost("/api/players/me/delete", OperationId = "deleteMyAccount")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [EmptyResponse]
    public static async Task Post(
        DeleteMyAccount request, Account account, AccountErasure erasure, IPlayerSignIn signIn, PlayersMetrics metrics, ILogger<DeleteMyAccount> logger,
        CancellationToken ct)
    {
        var erased = await erasure.EraseAsync(account.PlayerId, ct);
        PlayersLog.AccountErased(logger, account.PlayerId, "request", erased.Games, erased.Devices);
        metrics.AccountErased("request");
        await signIn.SignOutAsync();
    }
}
