using Microsoft.Extensions.DependencyInjection;
using Wolverine.Runtime;

namespace InSeconds.IntegrationTests.Messaging;

/// <summary>
/// Un message d'email porte l'adresse du destinataire : Wolverine ne le garde qu'un temps borné, traité ou en échec. Lu sur les réglages de l'hôte
/// démarré, pas sur la constante : un autre réglage de <c>Durability</c> poserait une autre durée.
/// </summary>
public class MessageRetentionTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync()
    {
        _api = new ApiFactory(await postgres.CreateDatabaseAsync());
        _ = _api.Services;
    }

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public void UnMessageTraite_RestePeuDeTemps_UnEchecTroisJours_PuisLaFileLEfface()
    {
        var durability = _api.Services.GetRequiredService<IWolverineRuntime>().Options.Durability;

        Assert.Equal(TimeSpan.FromMinutes(5), durability.KeepAfterMessageHandling);
        Assert.True(durability.DeadLetterQueueExpirationEnabled);
        Assert.Equal(TimeSpan.FromDays(3), durability.DeadLetterQueueExpiration);
    }
}
