using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Social.Application;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Rien de personnel dans les journaux (règle de la racine : jamais d'email, de pseudo ni de nom de groupe), sur un parcours complet : création du
/// compte par lien magique, lecture du profil, demande de changement d'adresse, alias au classement général, groupe, copie des données,
/// suppression refusée puis acceptée. Les tests de chaque route le vérifient route par route ; celui-ci attrape un journal ajouté à l'écart.
/// </summary>
public class PlayerDataLogsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Email = "journal.secret@example.com";
    private const string NewEmail = "autre.adresse.secrete@example.com";
    private const string Pseudo = "PseudoSecret42";
    private const string GroupName = "Groupe Confidentiel";

    private readonly CapturedLogs _logs = new();
    private MagicLinkApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync(), recordGrants: false,
            configureServices: services => services.AddSingleton<ILoggerProvider>(_logs));
        _ = _app.Api.Server;
        await PlayerDataSeed.AddChallengeAsync(_app.Api);
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task ParcoursComplet_AucunEmailNiPseudoNiNomDeGroupeDansLesJournaux()
    {
        var device = await _app.SignInDeviceAsync(Email, Pseudo);
        await PlayerDataSeed.AddGameAsync(_app.Api, device.PlayerId);

        (await device.Client.GetAsync("/api/players/me", Ct)).EnsureSuccessStatusCode();
        (await device.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange(NewEmail), Ct)).EnsureSuccessStatusCode();
        var alias = await (await device.Client.PutAsJsonAsync("/api/social/ranking/identity", new { mode = "alias" }, Ct)).Content.ReadFromJsonAsync<RankingIdentityResponse>(Ct);
        (await device.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup(GroupName), Ct)).EnsureSuccessStatusCode();
        (await device.Client.GetAsync("/api/players/me/export", Ct)).EnsureSuccessStatusCode();
        // Un refus (le pseudo retapé est faux) passe aussi par le journal des erreurs.
        Assert.False((await device.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Autre"), Ct)).IsSuccessStatusCode);
        (await device.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount(Pseudo), Ct)).EnsureSuccessStatusCode();

        // Le parcours a bien écrit des journaux (sans quoi l'absence de données personnelles ne prouverait rien), dont celui de l'effacement.
        Assert.NotEmpty(_logs.Entries);
        Assert.Contains(_logs.Entries, entry => entry.EventId == 1008);
        foreach (var secret in new[] { Email, NewEmail, Pseudo, GroupName, alias!.Alias! })
            Assert.DoesNotContain(_logs.Entries, entry => entry.Message.Contains(secret, StringComparison.OrdinalIgnoreCase));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
