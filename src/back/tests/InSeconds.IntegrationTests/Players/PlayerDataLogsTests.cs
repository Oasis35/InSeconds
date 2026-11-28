using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Social.Application;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.IntegrationTests.Players;

/// <summary>
/// Rien de personnel dans les journaux (règle de la racine : jamais d'email, de pseudo ni de nom de groupe), sur un parcours complet : création du
/// compte par lien magique, lecture du profil, changement de pseudo, demande de changement d'adresse, alias au classement général, groupe créé puis
/// renommé, pseudo d'invité, copie des données, deux refus (pseudo déjà pris, pseudo de suppression faux), suppression. Les tests de chaque route le
/// vérifient route par route ; celui-ci attrape un journal ajouté à l'écart.
/// <para>
/// Limites : <see cref="CapturedLogs"/> lit le message et le texte de l'exception, pas les scopes ni les propriétés qui ne sont pas dans le gabarit ;
/// le niveau est celui de l'hôte (Information, et Warning pour le framework). Ne sont pas jouées ici : le jeu (Daily et Survie, par leurs propres tests),
/// la recherche Deezer, les erreurs du front, la purge nocturne et la modération de l'admin (leurs tests ont chacun leur capture).
/// </para>
/// </summary>
public class PlayerDataLogsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Email = "journal.secret@example.com";
    private const string NewEmail = "autre.adresse.secrete@example.com";
    private const string Pseudo = "PseudoSecret42";
    private const string NewPseudo = "NouveauSecret77";
    private const string TakenPseudo = "PseudoPrisSecret";
    private const string TakenEmail = "pris.secret@example.com";
    private const string GuestPseudo = "InviteSecret55";
    private const string GroupName = "Groupe Confidentiel";
    private const string RenamedGroup = "Renomme Confidentiel";

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
        await _app.SignInDeviceAsync(TakenEmail, TakenPseudo);
        await PlayerDataSeed.AddGameAsync(_app.Api, device.PlayerId);

        (await device.Client.GetAsync("/api/players/me", Ct)).EnsureSuccessStatusCode();
        (await device.Client.PutAsJsonAsync("/api/players/me/pseudo", new UpdatePseudo(NewPseudo), Ct)).EnsureSuccessStatusCode();
        // Un refus : le pseudo d'un autre compte (409), dont l'exception de la base ne doit rien laisser passer.
        Assert.Equal(HttpStatusCode.Conflict, (await device.Client.PutAsJsonAsync("/api/players/me/pseudo", new UpdatePseudo(TakenPseudo), Ct)).StatusCode);
        (await device.Client.PostAsJsonAsync("/api/players/me/email-change", new RequestEmailChange(NewEmail), Ct)).EnsureSuccessStatusCode();
        // La demande part par un message traité après la réponse : attendre l'email, sans quoi le journal du traitement serait lu trop tôt (ou après l'effacement).
        await _app.WaitForEmailAsync(NewEmail, 0);
        var identity = await device.Client.PutAsJsonAsync("/api/social/ranking/identity", new { mode = "alias" }, Ct);
        identity.EnsureSuccessStatusCode();
        var alias = (await identity.Content.ReadFromJsonAsync<RankingIdentityResponse>(Ct))!.Alias!;
        var created = await device.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup(GroupName), Ct);
        created.EnsureSuccessStatusCode();
        var group = (await created.Content.ReadFromJsonAsync<GroupSummaryResponse>(Ct))!;
        (await device.Client.PutAsJsonAsync($"/api/social/groups/{group.Id}/name", new RenameGroup(RenamedGroup), Ct)).EnsureSuccessStatusCode();
        (await device.Client.GetAsync("/api/players/me/export", Ct)).EnsureSuccessStatusCode();

        // Un invité choisit son pseudo de Survie.
        var guest = _app.Browser();
        (await guest.PostAsync("/api/players/guest", null, Ct)).EnsureSuccessStatusCode();
        (await guest.PutAsJsonAsync("/api/players/me/guest-pseudo", new SetGuestPseudo(GuestPseudo), Ct)).EnsureSuccessStatusCode();

        // Un refus (le pseudo retapé est faux), puis la suppression.
        Assert.False((await device.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Autre"), Ct)).IsSuccessStatusCode);
        (await device.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount(NewPseudo), Ct)).EnsureSuccessStatusCode();

        // Le parcours a bien écrit des journaux (sans quoi l'absence de données personnelles ne prouverait rien), dont celui de l'effacement.
        Assert.NotEmpty(_logs.Entries);
        Assert.Contains(_logs.Entries, entry => entry.EventId == 1008);
        foreach (var secret in new[] { Email, NewEmail, Pseudo, NewPseudo, TakenPseudo, TakenEmail, GuestPseudo, GroupName, RenamedGroup, alias })
        {
            Assert.DoesNotContain(_logs.Entries, entry => entry.Message.Contains(secret, StringComparison.OrdinalIgnoreCase));
            Assert.DoesNotContain(_logs.Entries, entry => entry.Exception?.Contains(secret, StringComparison.OrdinalIgnoreCase) == true);
        }
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
