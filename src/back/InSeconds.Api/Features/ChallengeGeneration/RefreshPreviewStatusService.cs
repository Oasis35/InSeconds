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
            var delay = ComputeDelayUntilNext11PmUtc();
            logger.LogInformation("Prochain refresh preview planifié dans {Delay:hh\\:mm\\:ss} (23h00 UTC).", delay);

            try { await Task.Delay(delay, stoppingToken); }
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

    internal static TimeSpan ComputeDelayUntilNext11PmUtc(DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var next = now.Date.AddHours(23);
        if (now >= next) next = next.AddDays(1);
        return next - now;
    }
}
