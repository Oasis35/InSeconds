using Hangfire;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Players.Domain;
using Wolverine;

namespace InSeconds.Api.Modules.Players.Application;

/// <summary>
/// Durées de conservation des données des joueurs (RGPD art. 5.1.e), appliquées chaque nuit par <see cref="PlayersPurgeJob"/>. Annoncées
/// sur la page confidentialité : les changer, c'est aussi changer ce texte.
/// </summary>
public static class PlayerRetention
{
    /// <summary>
    /// Un appareil sans visite depuis la durée du cookie (glissante, 90 jours) ne peut plus servir : il est supprimé, avec une journée de
    /// marge. Un appareil révoqué l'est au même âge.
    /// </summary>
    public static readonly TimeSpan StaleDevice = AuthSetup.CookieLifetime + TimeSpan.FromDays(1);

    /// <summary>Un compte sans visite depuis 3 ans est effacé (durée recommandée par la CNIL), sans email de prévenance. Jamais un admin.</summary>
    public static readonly TimeSpan InactiveAccount = TimeSpan.FromDays(3 * 365);
}

/// <summary>Supprime les jetons envoyés par email (connexion, changement d'adresse) une fois expirés ; rend leur nombre.</summary>
public sealed record PurgeExpiredAuthTokens;

/// <summary>Supprime les appareils qui ne peuvent plus servir (<see cref="PlayerRetention.StaleDevice"/>) ; rend leur nombre.</summary>
public sealed record PurgeStaleDevices;

/// <summary>Les joueurs dont le compte est inactif depuis <see cref="PlayerRetention.InactiveAccount"/>.</summary>
public sealed record ListInactiveAccounts;

/// <summary>Réponse de <see cref="ListInactiveAccounts"/> : un objet, pas une liste, que Wolverine prendrait pour des messages en cascade.</summary>
public sealed record InactiveAccounts(IReadOnlyList<Guid> PlayerIds);

/// <summary>Efface ce compte s'il est toujours inactif (le joueur a pu revenir entre la liste et l'effacement) ; rend vrai s'il l'a été.</summary>
public sealed record EraseInactiveAccount(Guid PlayerId);

public static class PlayersPurgeHandler
{
    public static async Task<int> Handle(PurgeExpiredAuthTokens command, IPlayerStore store, TimeProvider time, CancellationToken ct) =>
        await store.DeleteExpiredTokensAsync(time.GetUtcNow(), ct);

    public static async Task<int> Handle(PurgeStaleDevices command, IPlayerStore store, TimeProvider time, CancellationToken ct) =>
        await store.DeleteStaleDeviceSessionsAsync(time.GetUtcNow() - PlayerRetention.StaleDevice, ct);

    public static async Task<InactiveAccounts> Handle(ListInactiveAccounts query, IPlayerStore store, TimeProvider time, CancellationToken ct) =>
        new(await store.ListInactiveAccountsAsync(time.GetUtcNow() - PlayerRetention.InactiveAccount, ct));

    public static async Task<bool> Handle(
        EraseInactiveAccount command, IPlayerStore store, AccountErasure erasure, TimeProvider time, PlayersMetrics metrics,
        ILogger<EraseInactiveAccount> logger, CancellationToken ct)
    {
        if (!await store.IsAccountInactiveAsync(command.PlayerId, time.GetUtcNow() - PlayerRetention.InactiveAccount, ct))
            return false;
        var erased = await erasure.EraseAsync(command.PlayerId, ct);
        PlayersLog.AccountErased(logger, command.PlayerId, "inactive", erased.Games, erased.Devices);
        metrics.AccountErased("inactive");
        return true;
    }
}

/// <summary>
/// Tâche <c>players-purge-expired-tokens</c> (§ 5.4 bis du plan v2), chaque nuit à 3 h 30 UTC : les durées de conservation des données des
/// joueurs. Trois étapes, chacune dans sa propre transaction (un compte effacé = une transaction) : jetons expirés, appareils qui ne
/// peuvent plus servir, comptes inactifs depuis 3 ans. Une étape en échec n'empêche pas les suivantes ; la tâche échoue à la fin. Son
/// identifiant n'a pas changé quand elle a reçu les deux dernières (contrôle healthchecks.io et historique de <c>/jobs</c> gardés).
/// </summary>
public sealed class PlayersPurgeJob(IMessageBus bus, ILogger<PlayersPurgeJob> logger) : IScheduledJob
{
    public const string Id = "players-purge-expired-tokens";
    public const string DefaultCron = "30 3 * * *";
    public const string FailedCode = "players.purge_failed";

    [DisableConcurrentExecution(timeoutInSeconds: 600)]
    [AutomaticRetry(Attempts = 3)]
    public async Task<object?> RunAsync(CancellationToken cancellationToken)
    {
        var failed = false;

        async Task<T> StepAsync<T>(string step, Func<Task<T>> run, T fallback)
        {
            try
            {
                return await run();
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                failed = true;
                PlayersLog.PurgeStepFailed(logger, ex, step);
                return fallback;
            }
        }

        var tokens = await StepAsync("tokens", () => bus.InvokeAsync<int>(new PurgeExpiredAuthTokens(), cancellationToken), 0);
        var devices = await StepAsync("devices", () => bus.InvokeAsync<int>(new PurgeStaleDevices(), cancellationToken), 0);
        var inactive = await StepAsync(
            "accounts", () => bus.InvokeAsync<InactiveAccounts>(new ListInactiveAccounts(), cancellationToken), new InactiveAccounts([]));
        var accounts = 0;
        foreach (var playerId in inactive.PlayerIds)
            if (await StepAsync("accounts", () => bus.InvokeAsync<bool>(new EraseInactiveAccount(playerId), cancellationToken), false))
                accounts++;

        return failed
            ? throw new JobFailedException(FailedCode)
            // Un dictionnaire : Hangfire n'écrit pas les propriétés à zéro d'un objet.
            : new Dictionary<string, object?> { ["tokens"] = tokens, ["devices"] = devices, ["accounts"] = accounts };
    }
}
