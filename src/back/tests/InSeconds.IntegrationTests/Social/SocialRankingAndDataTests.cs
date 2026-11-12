using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using InSeconds.Api.Modules.Social.Application;
using InSeconds.IntegrationTests.Daily;
using InSeconds.IntegrationTests.Players;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Social;

/// <summary>
/// Le classement d'un groupe (nourri par les parties du mode Run, par le contrat de Social), ce que voit un non-membre (rien : 404, jamais un pseudo) et les droits
/// RGPD du joueur (copie et effacement, piège 48).
/// </summary>
public class SocialRankingAndDataTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;
    private int _challengeId;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 40);
        await _game.Api.ExecuteAsync("UPDATE catalogue.tracks SET deezer_rank = 1000000 - id * 1000");
        using var scope = _game.Api.Services.CreateScope();
        var plan = await scope.ServiceProvider.GetRequiredService<RunChallengePlanner>().PlanAsync(null, Ct);
        scope.ServiceProvider.GetRequiredService<IRunsStore>().AddChallenge(plan.Challenge!);
        await scope.ServiceProvider.GetRequiredService<InSecondsDbContext>().SaveChangesAsync(Ct);
        _challengeId = plan.Challenge!.Id;
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    /// <summary>Une partie finie (1 gagnée, 2 perdue, 3 abandonnée) sur la playlist de test (4 manches).</summary>
    private async Task AddRunAsync(Guid playerId, int status, int roundsPassed, int score, int minutesAgo = 1)
    {
        // Une partie par joueur et par playlist : chaque partie a sa copie de la playlist de test (mêmes règles).
        var challengeId = await _game.Api.ScalarAsync<int>("SELECT nextval('runs.challenges_hilo')::int");
        var code = string.Concat(challengeId.ToString("D6", System.Globalization.CultureInfo.InvariantCulture).Select(c => (char)('A' + (c - '0'))));
        await _game.Api.ExecuteAsync($"""
            INSERT INTO runs.challenges (id, code, seed, rules, created_at)
            SELECT {challengeId}, '{code}', 1, rules, now() FROM runs.challenges WHERE id = {_challengeId}
            """);
        var id = await _game.Api.ScalarAsync<int>("SELECT nextval('runs.sessions_hilo')::int");
        await _game.Api.ExecuteAsync($"""
            INSERT INTO runs.sessions (id, challenge_id, player_id, status, current_position, rounds_passed, total_score, started_at, ended_at)
            VALUES ({id}, {challengeId}, '{playerId}', {status}, 1, {roundsPassed}, {score}, now() - interval '{minutesAgo + 5} minutes', now() - interval '{minutesAgo} minutes')
            """);
    }

    private async Task<(Gamer Alice, Gamer Bob, Gamer Carol, GroupSummaryResponse Group)> GroupOfThreeAsync()
    {
        var (alice, bob, carol) = (await _game.NewPlayerAsync("Alice"), await _game.NewPlayerAsync("Bob"), await _game.NewPlayerAsync("Carol"));
        var response = await alice.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup("Les copains"), Ct);
        var group = (await response.Content.ReadFromJsonAsync<GroupSummaryResponse>(Ct))!;
        await bob.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);
        await carol.Client.PostAsync($"/api/social/invitations/{group.InviteCode}/join", null, Ct);
        return (alice, bob, carol, group);
    }

    [Fact]
    public async Task Classement_ParPerformanceRecente_LesSansPartieALaFin()
    {
        var (alice, bob, carol, group) = await GroupOfThreeAsync();
        await AddRunAsync(alice.Id, status: 2, roundsPassed: 2, score: 800);
        await AddRunAsync(bob.Id, status: 1, roundsPassed: 4, score: 2500);
        // Une partie abandonnée ne compte pas : Carol reste sans classement.
        await AddRunAsync(carol.Id, status: 3, roundsPassed: 3, score: 1500);

        var ranking = (await alice.Client.GetFromJsonAsync<GroupRankingResponse>($"/api/social/groups/{group.Id}/ranking", Ct))!;

        Assert.Equal(["Bob", "Alice", "Carol"], ranking.Entries.Select(e => e.Pseudo));
        Assert.Equal([1, 2, null], ranking.Entries.Select(e => e.Rank));
        Assert.Equal([1d, 0.5d, null], ranking.Entries.Select(e => e.Performance));
        Assert.Equal([2500, 800, null], ranking.Entries.Select(e => e.BestScore));
        Assert.Equal([false, true, false], ranking.Entries.Select(e => e.IsMe));
    }

    [Fact]
    public async Task Classement_MoyenneDesCinqDernieresParties()
    {
        var (alice, _, _, group) = await GroupOfThreeAsync();
        // Six parties : la plus ancienne (4 manches sur 4) sort de la fenêtre des cinq dernières.
        await AddRunAsync(alice.Id, status: 1, roundsPassed: 4, score: 2000, minutesAgo: 60);
        for (var i = 1; i <= 5; i++)
            await AddRunAsync(alice.Id, status: 2, roundsPassed: 0, score: 100, minutesAgo: i);

        var ranking = (await alice.Client.GetFromJsonAsync<GroupRankingResponse>($"/api/social/groups/{group.Id}/ranking", Ct))!;

        var me = ranking.Entries.Single(e => e.IsMe);
        Assert.Equal(0d, me.Performance);
        Assert.Equal(6, me.GamesPlayed);
        Assert.Equal(2000, me.BestScore);
    }

    [Fact]
    public async Task NonMembre_404_SurLeDetailEtLeClassement_JamaisUnPseudo()
    {
        var (_, _, _, group) = await GroupOfThreeAsync();
        var stranger = await _game.NewPlayerAsync("Mallory");
        var guest = await _game.NewPlayerAsync();

        foreach (var outsider in new[] { stranger, guest })
        {
            foreach (var path in new[] { $"/api/social/groups/{group.Id}", $"/api/social/groups/{group.Id}/ranking" })
            {
                var response = await outsider.Client.GetAsync(path, Ct);
                Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
                var body = await response.Content.ReadAsStringAsync(Ct);
                Assert.DoesNotContain("Alice", body, StringComparison.Ordinal);
                Assert.DoesNotContain("Bob", body, StringComparison.Ordinal);
            }
        }
    }

    [Fact]
    public async Task Classement_SansCookie_401()
    {
        var (_, _, _, group) = await GroupOfThreeAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync($"/api/social/groups/{group.Id}/ranking", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync($"/api/social/groups/{group.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _game.Api.CreateClient().GetAsync("/api/social/groups", Ct)).StatusCode);
    }

    [Fact]
    public async Task Export_LesGroupesDuJoueur_SansLesAutresMembres()
    {
        var (alice, bob, _, _) = await GroupOfThreeAsync();

        var export = (await bob.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        var social = ExportReading.Section<SocialDataExport>(export, "social");
        var group = Assert.Single(social.Groups);
        Assert.Equal(("Les copains", false, 3), (group.Name, group.IsOwner, group.MemberCount));
        var json = System.Text.Json.JsonSerializer.Serialize(export);
        Assert.DoesNotContain("Carol", json, StringComparison.Ordinal);
        Assert.DoesNotContain("Alice", json, StringComparison.Ordinal);
        Assert.True(ExportReading.Section<SocialDataExport>((await alice.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!, "social").Groups[0].IsOwner);
    }

    [Fact]
    public async Task Export_AucunGroupe_SectionVideMaisPresente()
    {
        var dave = await _game.NewPlayerAsync("Dave");

        var social = ExportReading.Section<SocialDataExport>((await dave.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!, "social");

        Assert.Empty(social.Groups);
    }

    [Fact]
    public async Task Effacement_UnMembre_QuitteSesGroupes_LeCreateurPasseLaMain_LeDernierSupprimeLeGroupe()
    {
        var (alice, bob, carol, group) = await GroupOfThreeAsync();
        var solo = (await (await carol.Client.PostAsJsonAsync("/api/social/groups", new CreateGroup("Solo"), Ct)).Content.ReadFromJsonAsync<GroupSummaryResponse>(Ct))!;

        (await alice.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Alice"), Ct)).EnsureSuccessStatusCode();
        (await carol.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Carol"), Ct)).EnsureSuccessStatusCode();

        // Alice, créatrice, est partie : Bob (le plus ancien membre restant) a pris la main ; le groupe de Carol seule a disparu.
        var detail = (await bob.Client.GetFromJsonAsync<GroupDetailResponse>($"/api/social/groups/{group.Id}", Ct))!;
        Assert.True(detail.IsOwner);
        Assert.Equal(["Bob"], detail.Members.Select(m => m.Pseudo));
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM social.groups WHERE id = {solo.Id}"));
        // Aucune ligne de Social ne mène plus à un joueur effacé (piège 48 : toutes les colonnes qui désignent un joueur).
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM social.group_members WHERE player_id IN ('{alice.Id}', '{carol.Id}')"));
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM social.groups WHERE owner_id IN ('{alice.Id}', '{carol.Id}')"));
    }

    [Fact]
    public async Task Piege48_ToutesLesColonnesPlayerIdDeSocial_SontConnuesDeLEffacement()
    {
        var tables = (await _game.Api.ScalarAsync<string[]>("""
            SELECT array_agg(table_schema || '.' || table_name || '.' || column_name) FROM information_schema.columns
            WHERE column_name IN ('player_id', 'owner_id') AND table_schema = 'social'
            """))!;

        Assert.Equal(["social.group_members.player_id", "social.groups.owner_id"], tables.Order(StringComparer.Ordinal));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
