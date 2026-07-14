namespace InSeconds.Api.Features.ChallengeGeneration;

public sealed class RefreshPreviewStatusService(
    IServiceScopeFactory scopeFactory,
    ILogger<RefreshPreviewStatusService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var target = DailySchedule.NextUtcHour(23);
            logger.LogInformation("Prochain refresh preview planifié dans {Delay:hh\\:mm\\:ss} (23h00 UTC).", target - DateTime.UtcNow);

            try { await DailySchedule.DelayUntilAsync(target, stoppingToken); }
            catch (OperationCanceledException) { break; }

            await TryRefreshAsync(stoppingToken);
        }
    }

    private async Task TryRefreshAsync(CancellationToken ct)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            await scope.ServiceProvider
                .GetRequiredService<PreviewStatusRefresher>()
                .RefreshAsync(ct);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            logger.LogError(ex, "Erreur lors du refresh des previews.");
        }
    }
}
