using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Modules.Social.Application;
using InSeconds.IntegrationTests.Daily;
using Microsoft.AspNetCore.Mvc;

namespace InSeconds.IntegrationTests.Social;

/// <summary>
/// Les groupes entre amis par HTTP : création (compte requis, nom contrôlé, limites), adhésion par le lien d'invitation, quitter, supprimer, et ce que
/// voit un non-membre (rien : 404). Les joueurs sont ceux du Daily (<see cref="GameApi"/>), un compte quand ils ont un pseudo.
/// </summary>
public class SocialGroupTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 0);

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    [Fact]
    public async Task Creation_UnCompte_DevientCreateurEtPremierMembre()
    {
        var alice = await _game.NewPlayerAsync("Alice");

        var response = await alice.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup(" Les copains "), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var group = (await response.Content.ReadFromJsonAsync<GroupSummaryResponse>(Ct))!;
        Assert.Equal(("Les copains", 1, 15, true), (group.Name, group.MemberCount, group.MaxMembers, group.IsOwner));
        Assert.Equal(8, group.InviteCode.Length);
        var detail = (await alice.Client.GetFromJsonAsync<GroupDetailResponse>($"/api/social/groups/{group.Id}", Ct))!;
        var member = Assert.Single(detail.Members);
        Assert.Equal(("Alice", true, true), (member.Pseudo, member.IsMe, member.IsOwner));
    }

    [Fact]
    public async Task Creation_UnInvite_403CompteRequis()
    {
        var guest = await _game.NewPlayerAsync();

        var response = await guest.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup("Les copains"), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(SocialErrorCodes.AccountRequired, await CodeOfAsync(response));
    }

    [Fact]
    public async Task Creation_SansCookie_401() =>
        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().PostAsJsonAsync("/api/social/groups", new CreateGroup("Les copains"), Ct)).StatusCode);

    [Theory]
    [InlineData("ab")]
    [InlineData("Un nom beaucoup trop long pour un groupe")]
    [InlineData("Les <copains>")]
    [InlineData("   ")]
    public async Task Creation_NomInvalide_400(string name)
    {
        var alice = await _game.NewPlayerAsync("Alice");

        var response = await alice.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup(name), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(SocialErrorCodes.InvalidName, await CodeOfAsync(response));
    }

    [Fact]
    public async Task Creation_LimiteDeGroupesParJoueur_EtReglageRelu()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        for (var i = 1; i <= 5; i++)
            Assert.Equal(HttpStatusCode.OK, (await alice.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup($"Groupe {i}"), Ct)).StatusCode);

        var sixth = await alice.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup("Groupe 6"), Ct);

        Assert.Equal(HttpStatusCode.Conflict, sixth.StatusCode);
        Assert.Equal(SocialErrorCodes.TooManyGroups, await CodeOfAsync(sixth));

        // Le réglage se relit à chaud, sans redémarrage.
        await _game.SetSettingAsync("Social:MaxGroupsPerPlayer", "6");
        Assert.Equal(HttpStatusCode.OK, (await alice.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup("Groupe 6"), Ct)).StatusCode);
    }

    [Fact]
    public async Task Adhesion_ParLeLien_LeNouveauVoitLesPseudos_EtUnLienRouvertNeChangeRien()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var group = await CreateAsync(alice, "Les copains");

        var join = await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode.ToLowerInvariant()}/join", null, Ct);
        var again = await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);

        Assert.Equal(HttpStatusCode.OK, join.StatusCode);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        var detail = (await bob.Client.GetFromJsonAsync<GroupDetailResponse>($"/api/social/groups/{group.Id}", Ct))!;
        Assert.Equal(["Alice", "Bob"], detail.Members.Select(m => m.Pseudo));
        Assert.False(detail.IsOwner);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM social.group_members WHERE player_id = '{bob.Id}'"));
    }

    [Fact]
    public async Task Adhesion_UnInvite_403_EtLeLienReste()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var guest = await _game.NewPlayerAsync();
        var group = await CreateAsync(alice, "Les copains");

        var response = await guest.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(SocialErrorCodes.AccountRequired, await CodeOfAsync(response));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.group_members"));
    }

    [Fact]
    public async Task Adhesion_CodeInconnu_404()
    {
        var alice = await _game.NewPlayerAsync("Alice");

        foreach (var code in new[] { "ZZZZZZZZ", "court", "" + "AAAAAAAAAA" })
        {
            var response = await alice.Client.PostAsync($"/api/social/invitations/{code}/join", null, Ct);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal(SocialErrorCodes.InvitationNotFound, await CodeOfAsync(response));
        }
    }

    [Fact]
    public async Task Adhesion_GroupeComplet_409()
    {
        await _game.SetSettingAsync("Social:MaxMembersPerGroup", "2");
        var (alice, bob, carol) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"), await _game.NewPlayerAsync("Carol"));
        var group = await CreateAsync(alice, "Les copains");
        Assert.Equal(HttpStatusCode.OK, (await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).StatusCode);

        var response = await carol.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(SocialErrorCodes.GroupFull, await CodeOfAsync(response));
        // Un membre qui rouvre le lien d'un groupe complet n'est pas refusé.
        Assert.Equal(HttpStatusCode.OK, (await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task Adhesion_TropDeGroupes_409()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        for (var i = 1; i <= 5; i++)
        {
            var group = await CreateAsync(alice, $"Groupe {i}");
            Assert.Equal(HttpStatusCode.OK, (await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).StatusCode);
        }

        var sixth = await CreateAsync(await _game.NewPlayerAsync("Carol"), "Groupe 6");
        var response = await bob.Client.PostAsync($"/api/social/invitations/{sixth.InviteCode}/join", null, Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(SocialErrorCodes.TooManyGroups, await CodeOfAsync(response));
    }

    [Fact]
    public async Task Invitation_Apercu_AnonymePermis_NomEtPlaceSeulement()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var group = await CreateAsync(alice, "Les copains");

        var anonymous = (await _game.Api.CreateClient().GetFromJsonAsync<InvitationResponse>($"/api/social/invitations/{group.InviteCode}", Ct))!;
        var member = (await alice.Client.GetFromJsonAsync<InvitationResponse>($"/api/social/invitations/{group.InviteCode}", Ct))!;

        Assert.Equal(("Les copains", 1, 15, false, false), (anonymous.GroupName, anonymous.MemberCount, anonymous.MaxMembers, anonymous.IsFull, anonymous.AlreadyMember));
        Assert.True(member.AlreadyMember);
        Assert.Equal(HttpStatusCode.NotFound, (await _game.Api.CreateClient().GetAsync("/api/social/invitations/ZZZZZZZZ", Ct)).StatusCode);
    }

    [Fact]
    public async Task Liste_SesGroupes_EtUnInviteEnAucun()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var guest = await _game.NewPlayerAsync();
        await CreateAsync(alice, "Premier");
        await CreateAsync(alice, "Second");

        var mine = (await alice.Client.GetFromJsonAsync<GroupListResponse>("/api/social/groups", Ct))!;
        var none = (await guest.Client.GetFromJsonAsync<GroupListResponse>("/api/social/groups", Ct))!;

        Assert.Equal(["Premier", "Second"], mine.Groups.Select(g => g.Name));
        Assert.Equal(5, mine.MaxGroups);
        Assert.Empty(none.Groups);
    }

    [Fact]
    public async Task Quitter_LeCreateurPasseLaMain_EtLeDernierSupprimeLeGroupe()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var group = await CreateAsync(alice, "Les copains");
        await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);

        Assert.Equal(HttpStatusCode.NoContent, (await alice.Client.DeleteAsync($"/api/social/groups/{group.Id}/membership", Ct)).StatusCode);

        var detail = (await bob.Client.GetFromJsonAsync<GroupDetailResponse>($"/api/social/groups/{group.Id}", Ct))!;
        Assert.True(detail.IsOwner);
        Assert.Equal(HttpStatusCode.NotFound, (await alice.Client.GetAsync($"/api/social/groups/{group.Id}", Ct)).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await bob.Client.DeleteAsync($"/api/social/groups/{group.Id}/membership", Ct)).StatusCode);
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.groups"));
    }

    [Fact]
    public async Task Quitter_UnNonMembre_404()
    {
        var (alice, bob) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"));
        var group = await CreateAsync(alice, "Les copains");

        Assert.Equal(HttpStatusCode.NotFound, (await bob.Client.DeleteAsync($"/api/social/groups/{group.Id}/membership", Ct)).StatusCode);
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.group_members"));
    }

    [Fact]
    public async Task Supprimer_LeCreateurSeulement()
    {
        var (alice, bob, carol) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"), await _game.NewPlayerAsync("Carol"));
        var group = await CreateAsync(alice, "Les copains");
        await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);

        var byMember = await bob.Client.DeleteAsync($"/api/social/groups/{group.Id}", Ct);
        var byStranger = await carol.Client.DeleteAsync($"/api/social/groups/{group.Id}", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, byMember.StatusCode);
        Assert.Equal(SocialErrorCodes.NotOwner, await CodeOfAsync(byMember));
        Assert.Equal(HttpStatusCode.NotFound, byStranger.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await alice.Client.DeleteAsync($"/api/social/groups/{group.Id}", Ct)).StatusCode);
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.groups"));
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.group_members"));
    }

    [Fact]
    public async Task CodeDInvitation_Renouvele_LAncienLienNeRejointPlus()
    {
        var (alice, bob, carol) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"), await _game.NewPlayerAsync("Carol"));
        var group = await CreateAsync(alice, "Les copains");
        await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);

        Assert.Equal(HttpStatusCode.Forbidden, (await bob.Client.PostAsync($"/api/social/groups/{group.Id}/invite-code", null, Ct)).StatusCode);
        var rotated = (await (await alice.Client.PostAsync($"/api/social/groups/{group.Id}/invite-code", null, Ct)).Content.ReadFromJsonAsync<InviteCodeResponse>(Ct))!;

        Assert.NotEqual(group.InviteCode, rotated.InviteCode);
        Assert.Equal(HttpStatusCode.NotFound, (await carol.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await carol.Client.PostAsync($"/api/social/invitations/{rotated.InviteCode}/join", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task AdhesionsSimultanees_NeDepassentPasLaPlaceDuGroupe()
    {
        await _game.SetSettingAsync("Social:MaxMembersPerGroup", "3");
        var alice = await _game.NewPlayerAsync("Alice");
        var others = new List<Gamer>();
        for (var i = 0; i < 6; i++)
            others.Add(await _game.NewPlayerAsync($"Joueur{i}"));
        var group = await CreateAsync(alice, "Les copains");

        var responses = await Task.WhenAll(others.Select(o => o.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct)));

        Assert.Equal(2, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(4, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(3L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM social.group_members"));
    }

    private static async Task<GroupSummaryResponse> CreateAsync(Gamer owner, string name)
    {
        var response = await owner.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup(name), Ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<GroupSummaryResponse>(Ct))!;
    }

    internal static async Task<string?> CodeOfAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ProblemDetails>(Ct))!.Extensions["code"]?.ToString();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
