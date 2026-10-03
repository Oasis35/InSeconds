using InSeconds.Api.Modules.Players.Application;
using InSeconds.Infrastructure.Email;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Wolverine;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// S1 : le jeton est généré, enregistré et envoyé dans la même transaction. Si l'envoi échoue, rien
/// n'est enregistré : aucun jeton en base qui n'aurait été envoyé à personne.
/// </summary>
public class MagicLinkEmailFailureTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync()
    {
        _api = new ApiFactory(await postgres.CreateDatabaseAsync(), services =>
        {
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender, FailingEmailSender>();
        });
        _ = _api.Services; // démarre l'hôte : migrations, tables de Wolverine
    }

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task EchecDEnvoi_AucunJetonEnregistre()
    {
        await using var scope = _api.Services.CreateAsyncScope();
        var bus = scope.ServiceProvider.GetRequiredService<IMessageBus>();

        await Assert.ThrowsAnyAsync<Exception>(() =>
            bus.InvokeAsync(new SendMagicLinkEmail("panne@example.com"), TestContext.Current.CancellationToken));

        Assert.Equal(0L, await _api.ScalarAsync<long>("SELECT count(*) FROM players.auth_tokens"));
    }

    private sealed class FailingEmailSender : IEmailSender
    {
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default) =>
            throw new HttpRequestException("Brevo indisponible.");
    }
}
