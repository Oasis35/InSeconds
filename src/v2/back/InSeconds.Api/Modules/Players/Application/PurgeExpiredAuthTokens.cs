using Hangfire;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Modules.Players.Domain;
using Wolverine;

namespace InSeconds.Api.Modules.Players.Application;

/// <summary>Supprime les jetons envoyés par email (connexion, changement d'adresse) une fois expirés.</summary>
public sealed record PurgeExpiredAuthTokens;

/// <param name="Deleted">Nombre de jetons supprimés : compte rendu de la tâche dans <c>/jobs</c>.</param>
public sealed record PurgedAuthTokens(int Deleted);

public static class PurgeExpiredAuthTokensHandler
{
    public static async Task<PurgedAuthTokens> Handle(PurgeExpiredAuthTokens command, IPlayerStore store, TimeProvider time, CancellationToken ct) =>
        new(await store.DeleteExpiredTokensAsync(time.GetUtcNow(), ct));
}

/// <summary>Tâche <c>players-purge-expired-tokens</c> (§ 5.4 bis du plan v2), chaque nuit à 3 h 30 UTC.</summary>
public sealed class PurgeExpiredAuthTokensJob(IMessageBus bus) : IScheduledJob
{
    public const string Id = "players-purge-expired-tokens";
    public const string DefaultCron = "30 3 * * *";

    [DisableConcurrentExecution(timeoutInSeconds: 600)]
    [AutomaticRetry(Attempts = 3)]
    public async Task<object?> RunAsync(CancellationToken cancellationToken) =>
        await bus.InvokeAsync<PurgedAuthTokens>(new PurgeExpiredAuthTokens(), cancellationToken);
}
