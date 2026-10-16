namespace InSeconds.IntegrationTests.Jobs;

/// <summary>
/// Tests qui font tourner un vrai serveur Hangfire. Hangfire garde son activateur de tâches en global
/// (<c>JobActivator.Current</c>, posé à chaque configuration) : une autre API de test, créée puis
/// détruite en parallèle, le remplace, et le serveur ouvre alors un scope sur un
/// <c>IServiceProvider</c> détruit (<c>ObjectDisposedException</c> au lieu de l'échec attendu, vu en
/// CI sur la PR A6). Ces tests passent donc seuls, après les autres. Sans effet en prod : une seule
/// API par processus.
/// </summary>
[CollectionDefinition(nameof(HangfireServerCollection), DisableParallelization = true)]
public sealed class HangfireServerCollection;
