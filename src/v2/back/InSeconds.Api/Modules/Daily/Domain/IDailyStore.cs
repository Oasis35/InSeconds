namespace InSeconds.Api.Modules.Daily.Domain;

/// <summary>
/// Écritures du module Daily, et les lectures qui les précèdent. Rien n'est enregistré ici : dans un handler Wolverine,
/// la transaction est appliquée par Wolverine (<c>AutoApplyTransactions</c>).
/// </summary>
public interface IDailyStore
{
    /// <summary>
    /// Réserve la génération du défi de ce jour jusqu'à la fin de la transaction : une génération simultanée attend
    /// la fin de la première, puis voit son défi. Sans cela, deux générations qui se croisent calculeraient chacune
    /// un tirage, et la seconde échouerait sur l'index unique de la date.
    /// </summary>
    Task LockGenerationAsync(DateOnly day, CancellationToken ct);

    /// <summary>Le défi de ce jour, s'il existe.</summary>
    Task<DailyChallenge?> FindChallengeAsync(DateOnly day, CancellationToken ct);

    ValueTask AddAsync(DailyChallenge challenge, CancellationToken ct);
}
