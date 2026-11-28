using System.Diagnostics;

namespace InSeconds.IntegrationTests;

/// <summary>
/// Attendre qu'une condition devienne vraie, plutôt qu'une durée choisie à l'œil : le test avance dès que la condition est là
/// (rapide sur une machine libre) et n'échoue que si elle n'arrive jamais avant l'échéance (large, pour un runner lent).
/// À utiliser quand aucun signal ne peut être posé dans le code testé ; sinon préférer un <see cref="TaskCompletionSource"/>.
/// </summary>
public static class Waiting
{
    /// <summary>Plafond par défaut : une condition qui n'est pas là au bout de 20 s ne viendra pas.</summary>
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(20);

    private static readonly TimeSpan PollEvery = TimeSpan.FromMilliseconds(25);

    /// <summary>Relit une valeur jusqu'à ce qu'elle vérifie la condition, et la rend ; échoue avec <paramref name="failure"/> à l'échéance.</summary>
    public static async Task<T> UntilAsync<T>(Func<Task<T>> read, Func<T, bool> done, string failure, CancellationToken ct, TimeSpan? timeout = null)
    {
        var deadline = Stopwatch.StartNew();
        var limit = timeout ?? DefaultTimeout;
        while (true)
        {
            var value = await read();
            if (done(value))
                return value;
            if (deadline.Elapsed > limit)
                throw new TimeoutException(failure);
            await Task.Delay(PollEvery, ct);
        }
    }

    /// <summary>Attend qu'une condition asynchrone soit vraie.</summary>
    public static Task UntilAsync(Func<Task<bool>> condition, string failure, CancellationToken ct, TimeSpan? timeout = null) =>
        UntilAsync(condition, done => done, failure, ct, timeout);

    /// <summary>Attend qu'une condition synchrone soit vraie.</summary>
    public static Task UntilAsync(Func<bool> condition, string failure, CancellationToken ct, TimeSpan? timeout = null) =>
        UntilAsync(() => Task.FromResult(condition()), done => done, failure, ct, timeout);

    /// <summary>
    /// Attend qu'au moins <paramref name="count"/> requêtes de la base du test soient bloquées sur un verrou (un verrou consultatif
    /// compris) : la preuve qu'une écriture concurrente attend bien celle qui tient le verrou.
    /// </summary>
    public static Task LockWaitersAsync(ApiFactory api, int count, CancellationToken ct) =>
        UntilAsync(
            async () => await api.ScalarAsync<long>(
                "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'") >= count,
            $"Moins de {count} requête(s) attendent un verrou.", ct);
}
