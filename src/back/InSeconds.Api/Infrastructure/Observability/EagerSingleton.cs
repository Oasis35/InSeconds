using Microsoft.Extensions.Hosting;

namespace InSeconds.Api.Infrastructure.Observability;

/// <summary>
/// Construit un singleton dès le démarrage. Une classe de métriques amorce ses compteurs à zéro dans son constructeur : construite
/// à la première requête, ce zéro partirait dans le même export que le premier incrément, et Prometheus perdrait ce premier échantillon.
/// </summary>
internal sealed class EagerSingleton<T>(IServiceProvider services) : IHostedService where T : class
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _ = services.GetService(typeof(T));
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
