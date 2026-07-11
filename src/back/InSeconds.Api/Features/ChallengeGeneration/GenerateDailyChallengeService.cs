namespace InSeconds.Api.Features.ChallengeGeneration;

public sealed class GenerateDailyChallengeService(
    IServiceScopeFactory scopeFactory,
    ILogger<GenerateDailyChallengeService> logger)
    : BackgroundService
{
    internal static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var succeeded = await TryGenerateAsync(stoppingToken);

            TimeSpan delay;
            if (succeeded)
            {
                delay = DailySchedule.DelayUntilNextUtcHour(0);
                logger.LogInformation("Prochain défi planifié dans {Delay:hh\\:mm\\:ss} (0h00 UTC).", delay);
            }
            else
            {
                delay = RetryDelay;
                logger.LogWarning("Génération échouée, nouvelle tentative dans {Delay:mm} min.", delay);
            }

            try { await Task.Delay(delay, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task<bool> TryGenerateAsync(CancellationToken ct)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var result = await scope.ServiceProvider
                .GetRequiredService<DailyChallengeGenerator>()
                .GenerateAsync(ct);

            if (result == GenerateResult.PoolInsufficient)
            {
                logger.LogError("Génération automatique impossible : pool insuffisant. Ajouter des morceaux avec preview.");
                return false;
            }

            return true;
        }
        catch (OperationCanceledException)
        {
            return true; // arrêt de l'app, pas un échec à retenter
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Erreur lors de la génération du défi quotidien.");
            return false;
        }
    }
}
