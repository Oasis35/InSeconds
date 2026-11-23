using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Social.Application;
using InSeconds.IntegrationTests.Daily;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InSeconds.IntegrationTests.Social;

/// <summary>
/// La modération des groupes dans l'admin : la liste (nom, membres, créateur, date, jamais le code d'invitation), le renommage, la remise à zéro d'un
/// nom inapproprié et la suppression, et ce que le journal en garde (des identifiants, jamais un nom). Les 401 / 403 de ces routes sont vérifiés pour
/// toutes les routes admin par <c>Security/SecurityTests</c> ; le refus d'un joueur simple l'est aussi ici, avec ses conséquences.
/// </summary>
public class AdminGroupsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private const string Route = "/api/admin/social/groups";

    private readonly CapturedLogs _logs = new();
    private GameApi _game = null!;
    private HttpClient _admin = null!;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(
            await postgres.CreateDatabaseAsync(), tracks: 0, configureServices: services => services.AddSingleton<ILoggerProvider>(_logs));
        _admin = _game.App.Admin();
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<GroupSummaryResponse> CreateAsync(Gamer owner, string name)
    {
        var response = await owner.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup(name), Ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<GroupSummaryResponse>(Ct))!;
    }

    private async Task<IReadOnlyList<AdminGroupResponse>> ListAsync() =>
        (await _admin.GetFromJsonAsync<AdminGroupsResponse>(Route, Ct))!.Groups;

    [Fact]
    public async Task Liste_NomMembresCreateurEtDate_JamaisLeCodeNiLesMembres()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var first = await CreateAsync(alice, "Les copains");
        (await bob.Client.PostAsync($"/api/social/invitations/{first.InviteCode}/join", null, Ct)).EnsureSuccessStatusCode();
        await CreateAsync(bob, "Les voisins");

        var response = await _admin.GetAsync(Route, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var groups = (await response.Content.ReadFromJsonAsync<AdminGroupsResponse>(Ct))!.Groups;
        Assert.Equal(["Les voisins", "Les copains"], groups.Select(g => g.Name));
        var copains = groups.Single(g => g.Id == first.Id);
        Assert.Equal((2, alice.Id, "Alice"), (copains.MemberCount, copains.OwnerId, copains.OwnerPseudo));
        var body = await response.Content.ReadAsStringAsync(Ct);
        Assert.DoesNotContain(first.InviteCode, body, StringComparison.Ordinal);
        Assert.DoesNotContain("inviteCode", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Liste_SansGroupe_EstVide() => Assert.Empty(await ListAsync());

    [Fact]
    public async Task Renommer_RemplaceLeNom_EtLeMembreLeVoit()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var group = await CreateAsync(alice, "Les copains");

        var response = await _admin.PutAsJsonAsync($"{Route}/{group.Id}/name", new RenameGroup("  Les amis  "), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Les amis", (await response.Content.ReadFromJsonAsync<GroupNameResponse>(Ct))!.Name);
        var detail = (await alice.Client.GetFromJsonAsync<GroupDetailResponse>($"/api/social/groups/{group.Id}", Ct))!;
        Assert.Equal("Les amis", detail.Name);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("Un nom beaucoup trop long pour un groupe")]
    [InlineData("Les <copains>")]
    [InlineData("   ")]
    public async Task Renommer_NomInvalide_400_EtRienNeChange(string name)
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var group = await CreateAsync(alice, "Les copains");

        var response = await _admin.PutAsJsonAsync($"{Route}/{group.Id}/name", new RenameGroup(name), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(SocialErrorCodes.InvalidName, await SocialGroupTests.CodeOfAsync(response));
        Assert.Equal("Les copains", Assert.Single(await ListAsync()).Name);
    }

    [Fact]
    public async Task RemettreAZero_DonneLeNomDeRemplacement_QuiResteValide()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var group = await CreateAsync(alice, "Nom inapproprié");

        var response = await _admin.PostAsync($"{Route}/{group.Id}/name/reset", null, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal($"Groupe {group.Id}", (await response.Content.ReadFromJsonAsync<GroupNameResponse>(Ct))!.Name);
        Assert.Equal($"Groupe {group.Id}", Assert.Single(await ListAsync()).Name);
        // Les membres voient le nouveau nom, et le groupe reste le leur.
        var detail = (await alice.Client.GetFromJsonAsync<GroupDetailResponse>($"/api/social/groups/{group.Id}", Ct))!;
        Assert.Equal($"Groupe {group.Id}", detail.Name);
    }

    [Fact]
    public async Task Supprimer_RetireLeGroupeEtSesAdhesions_QuelQueSoitLeCreateur()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var group = await CreateAsync(alice, "Les copains");
        (await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).EnsureSuccessStatusCode();
        var other = await CreateAsync(bob, "Les voisins");

        var response = await _admin.DeleteAsync($"{Route}/{group.Id}", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(other.Id, Assert.Single(await ListAsync()).Id);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.group_members"));
        Assert.Equal(HttpStatusCode.NotFound, (await bob.Client.GetAsync($"/api/social/groups/{group.Id}", Ct)).StatusCode);
        // Les comptes des membres, eux, ne changent pas.
        Assert.Equal(2L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM players.accounts"));
    }

    [Fact]
    public async Task Membres_PseudosCreateurEtDate_LePlusAncienDAbord_JamaisLeCode()
    {
        var (alice, bob, carol) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"), await _game.NewPlayerAsync("Carol"));
        var group = await CreateAsync(alice, "Les copains");
        (await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).EnsureSuccessStatusCode();
        (await carol.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).EnsureSuccessStatusCode();
        await CreateAsync(bob, "Les voisins");

        var response = await _admin.GetAsync($"{Route}/{group.Id}/members", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var members = (await response.Content.ReadFromJsonAsync<AdminGroupMembersResponse>(Ct))!.Members;
        Assert.Equal(["Alice", "Bob", "Carol"], members.Select(m => m.Pseudo).Order());
        Assert.Equal("Alice", Assert.Single(members, m => m.IsOwner).Pseudo);
        Assert.Equal(members.Select(m => m.JoinedAt).Order(), members.Select(m => m.JoinedAt));
        var body = await response.Content.ReadAsStringAsync(Ct);
        Assert.DoesNotContain(group.InviteCode, body, StringComparison.Ordinal);
        Assert.DoesNotContain(alice.Id.ToString(), body, StringComparison.OrdinalIgnoreCase);
    }

    private static string Members(int groupId) => $"{Route}/{groupId}/members";

    private static string Remove(int groupId, string pseudo, string? successor = null) =>
        $"{Members(groupId)}/{Uri.EscapeDataString(pseudo)}" + (successor is null ? "" : $"?successor={Uri.EscapeDataString(successor)}");

    [Fact]
    public async Task Retirer_UnMembre_LeGroupeResteAuMemeCreateur()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var group = await CreateAsync(alice, "Les copains");
        (await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).EnsureSuccessStatusCode();

        var response = await _admin.DeleteAsync(Remove(group.Id, "Bob"), Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var remaining = Assert.Single((await _admin.GetFromJsonAsync<AdminGroupMembersResponse>(Members(group.Id), Ct))!.Members);
        Assert.Equal("Alice", remaining.Pseudo);
        Assert.True(remaining.IsOwner);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.Client.GetAsync($"/api/social/groups/{group.Id}", Ct)).StatusCode);
        // Son compte, lui, ne change pas.
        Assert.Equal(2L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM players.accounts"));
    }

    [Fact]
    public async Task Retirer_LeCreateurAvecDAutresMembres_ExigeSonSuccesseur_EtSeFaitEnUnSeulAppel()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var group = await CreateAsync(alice, "Les copains");
        (await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).EnsureSuccessStatusCode();

        var none = await _admin.DeleteAsync(Remove(group.Id, "Alice"), Ct);
        var invalid = await _admin.DeleteAsync(Remove(group.Id, "Alice", "Inconnu"), Ct);

        Assert.Equal(HttpStatusCode.Conflict, none.StatusCode);
        Assert.Equal(SocialErrorCodes.OwnerMustHandOver, await SocialGroupTests.CodeOfAsync(none));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal(SocialErrorCodes.InvalidSuccessor, await SocialGroupTests.CodeOfAsync(invalid));
        Assert.Equal(2L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.group_members"));
        Assert.Equal(alice.Id, Assert.Single(await ListAsync()).OwnerId);

        Assert.Equal(HttpStatusCode.NoContent, (await _admin.DeleteAsync(Remove(group.Id, "Alice", "bob"), Ct)).StatusCode);

        var detail = (await bob.Client.GetFromJsonAsync<GroupDetailResponse>($"/api/social/groups/{group.Id}", Ct))!;
        Assert.True(detail.IsOwner);
        Assert.Single(detail.Members);
    }

    [Fact]
    public async Task Retirer_LeDernierMembre_SupprimeLeGroupeEtSesAdhesions()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var group = await CreateAsync(alice, "Les copains");

        var response = await _admin.DeleteAsync(Remove(group.Id, "Alice"), Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await ListAsync());
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.groups"));
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.group_members"));
    }

    [Fact]
    public async Task Retirer_UnJoueurQuiNEstPasMembre_404()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.NewPlayerAsync("Bob");
        var group = await CreateAsync(alice, "Les copains");

        var response = await _admin.DeleteAsync(Remove(group.Id, "Bob"), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(SocialErrorCodes.MemberNotFound, await SocialGroupTests.CodeOfAsync(response));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.group_members"));
    }

    [Fact]
    public async Task Confier_LeGroupeAUnAutreMembre_LAncienCreateurDevientMembre()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var group = await CreateAsync(alice, "Les copains");
        (await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).EnsureSuccessStatusCode();

        var response = await _admin.PutAsJsonAsync($"{Route}/{group.Id}/owner", new TransferAdminGroupOwner(" bob "), Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var copains = Assert.Single(await ListAsync());
        Assert.Equal((bob.Id, "Bob"), (copains.OwnerId, copains.OwnerPseudo));
        Assert.False((await alice.Client.GetFromJsonAsync<GroupDetailResponse>($"/api/social/groups/{group.Id}", Ct))!.IsOwner);
    }

    [Theory]
    [InlineData("Alice")]
    [InlineData("Carol")]
    [InlineData("Inconnu")]
    [InlineData("   ")]
    public async Task Confier_AuCreateurAUnNonMembreOuAUnInconnu_400_EtRienNeChange(string pseudo)
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.NewPlayerAsync("Carol");
        var group = await CreateAsync(alice, "Les copains");

        var response = await _admin.PutAsJsonAsync($"{Route}/{group.Id}/owner", new TransferAdminGroupOwner(pseudo), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(SocialErrorCodes.InvalidSuccessor, await SocialGroupTests.CodeOfAsync(response));
        Assert.Equal(alice.Id, Assert.Single(await ListAsync()).OwnerId);
    }

    [Fact]
    public async Task GroupeInconnu_404_SurChaqueAction()
    {
        var rename = await _admin.PutAsJsonAsync($"{Route}/999/name", new RenameGroup("Les amis"), Ct);
        var reset = await _admin.PostAsync($"{Route}/999/name/reset", null, Ct);
        var delete = await _admin.DeleteAsync($"{Route}/999", Ct);
        var members = await _admin.GetAsync($"{Route}/999/members", Ct);
        var owner = await _admin.PutAsJsonAsync($"{Route}/999/owner", new TransferAdminGroupOwner("Bob"), Ct);
        var remove = await _admin.DeleteAsync($"{Route}/999/members/Bob", Ct);

        foreach (var response in new[] { rename, reset, delete, members, owner, remove })
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal(SocialErrorCodes.GroupNotFound, await SocialGroupTests.CodeOfAsync(response));
        }
    }

    [Fact]
    public async Task UnJoueurSimple_403_EtRienNeChange_MemeSonPropreGroupe()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var group = await CreateAsync(alice, "Les copains");

        var responses = new[]
        {
            await alice.Client.GetAsync(Route, Ct),
            await alice.Client.GetAsync($"{Route}/{group.Id}/members", Ct),
            await alice.Client.PutAsJsonAsync($"{Route}/{group.Id}/owner", new TransferAdminGroupOwner("Alice"), Ct),
            await alice.Client.DeleteAsync($"{Route}/{group.Id}/members/Alice", Ct),
            await alice.Client.PutAsJsonAsync($"{Route}/{group.Id}/name", new RenameGroup("Les amis"), Ct),
            await alice.Client.PostAsync($"{Route}/{group.Id}/name/reset", null, Ct),
            await alice.Client.DeleteAsync($"{Route}/{group.Id}", Ct),
        };

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode));
        Assert.Equal("Les copains", Assert.Single(await ListAsync()).Name);
    }

    [Fact]
    public async Task Journaux_DesIdentifiantsSeulement_JamaisLeNomNiLePseudo()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var group = await CreateAsync(alice, "Nom inapproprié");

        (await _admin.PutAsJsonAsync($"{Route}/{group.Id}/name", new RenameGroup("Autre nom secret"), Ct)).EnsureSuccessStatusCode();
        (await _admin.PostAsync($"{Route}/{group.Id}/name/reset", null, Ct)).EnsureSuccessStatusCode();
        (await _admin.DeleteAsync($"{Route}/{group.Id}", Ct)).EnsureSuccessStatusCode();

        var bob = await _game.NewPlayerAsync("Bob");
        var other = await CreateAsync(alice, "Autre groupe");
        (await bob.Client.PostAsync($"/api/social/invitations/{other.InviteCode}/join", null, Ct)).EnsureSuccessStatusCode();
        (await _admin.PutAsJsonAsync($"{Route}/{other.Id}/owner", new TransferAdminGroupOwner("Bob"), Ct)).EnsureSuccessStatusCode();
        (await _admin.DeleteAsync(Remove(other.Id, "Alice"), Ct)).EnsureSuccessStatusCode();

        var admin = _logs.Entries.Where(e => e.EventId is 1805 or 1806 or 1807 or 1810 or 1811).ToList();
        Assert.Equal([1805, 1806, 1807, 1810, 1811], admin.Select(e => e.EventId).Order());
        Assert.All(admin.Where(e => e.EventId is 1805 or 1806 or 1807), e => Assert.Contains($"{group.Id}", e.Message, StringComparison.Ordinal));
        Assert.DoesNotContain(_logs.Entries, e =>
            e.Message.Contains("inapproprié", StringComparison.Ordinal) || e.Message.Contains("secret", StringComparison.Ordinal)
            || e.Message.Contains("Alice", StringComparison.Ordinal) || e.Message.Contains(group.InviteCode, StringComparison.Ordinal));
    }
}
