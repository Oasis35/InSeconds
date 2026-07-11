namespace InSeconds.Api.Features.ChallengeGeneration;

public sealed class GenerateDailyChallengeService(
    IServiceScopeFactory scopeFactory,
    ILogger<GenerateDailyChallengeService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await TryGenerateAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = ComputeDelayUntilNextMidnightUtc();
            logger.LogInformation("Prochain défi planifié dans {Delay:hh\\:mm\\:ss} (0h00 UTC).", delay);

            try { await Task.Delay(delay, stoppingToken); }
            catch (OperationCanceledException) { break; }

            await TryGenerateAsync(stoppingToken);
        }
    }

    private async Task TryGenerateAsync(CancellationToken ct)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var result = await scope.ServiceProvider
                .GetRequiredService<DailyChallengeGenerator>()
                .GenerateAsync(ct);

            if (result == GenerateResult.PoolInsufficient)
                logger.LogError("Génération automatique impossible : pool insuffisant. Ajouter des morceaux avec preview.");
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            logger.LogError(ex, "Erreur lors de la génération du défi quotidien.");
        }
    }

    internal static TimeSpan ComputeDelayUntilNextMidnightUtc(DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var next = now.Date;
        if (now >= next) next = next.AddDays(1);
        return next - now;
    }
}
