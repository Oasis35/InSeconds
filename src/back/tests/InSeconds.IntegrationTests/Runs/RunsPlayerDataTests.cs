using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using InSeconds.IntegrationTests.Daily;
using InSeconds.IntegrationTests.Players;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Runs dans les droits RGPD d'un joueur : la section « runs » de sa copie (parties, défis créés, record, accès) et l'effacement de ses parties,
/// réponses, record et accès ; les défis qu'il a créés restent jouables sans auteur. La copie passe par le profil, l'effacement par <c>AccountErasure</c>.
/// </summary>
public class RunsPlayerDataTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;
    private int _challengeId;
    private string _code = null!;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 40);
        await _game.Api.ExecuteAsync("UPDATE catalogue.tracks SET deezer_rank = 1000000 - id * 1000");
        using var scope = _game.Api.Services.CreateScope();
        var plan = await scope.ServiceProvider.GetRequiredService<RunChallengePlanner>().PlanAsync(null, TestContext.Current.CancellationToken);
        scope.ServiceProvider.GetRequiredService<IRunsStore>().AddChallenge(plan.Challenge!);
        await scope.ServiceProvider.GetRequiredService<InSecondsDbContext>().SaveChangesAsync(TestContext.Current.CancellationToken);
        (_challengeId, _code) = (plan.Challenge!.Id, plan.Challenge.Code);
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    /// <summary>Une partie de ce joueur sur le défi : deux morceaux répondus (le premier juste, le second raté), le record, l'accès.</summary>
    private async Task<int> AddRunAsync(Guid playerId, bool record = true)
    {
        var id = await _game.Api.ScalarAsync<int>("SELECT nextval('runs.sessions_hilo')::int");
        await _game.Api.ExecuteAsync($"""
            INSERT INTO runs.sessions (id, challenge_id, player_id, status, current_position, rounds_passed, total_score, started_at)
            VALUES ({id}, {_challengeId}, '{playerId}', 0, 3, 0, 100, '2026-10-21T08:00:00Z');
            INSERT INTO runs.answers (session_id, position, artist_correct, title_correct, points, neutralized, answered_at) VALUES
              ({id}, 1, true, true, 100, false, '2026-10-21T08:01:00Z'),
              ({id}, 2, false, false, 0, false, '2026-10-21T08:02:00Z');
            INSERT INTO runs.access (player_id, granted_at) VALUES ('{playerId}', '2026-10-20T08:00:00Z');
            """);
        if (record)
        {
            await _game.Api.ExecuteAsync(
                $"INSERT INTO runs.records (player_id, best_score, best_rounds_passed, session_id, achieved_at) VALUES ('{playerId}', 100, 0, {id}, '2026-10-21T08:05:00Z')");
        }

        return id;
    }

    [Fact]
    public async Task Export_ContientLaSectionRuns_PartiesDefisCreesRecordEtAcces()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await AddRunAsync(alice.Id);
        await _game.Api.ExecuteAsync($"UPDATE runs.challenges SET created_by = '{alice.Id}' WHERE id = {_challengeId}");

        var export = (await alice.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        Assert.Contains("runs", export.Modules.Keys);
        var runs = ExportReading.Section<RunsDataExport>(export, "runs");
        var game = Assert.Single(runs.Games);
        Assert.Equal((_code, "Pending", 100), (game.ChallengeCode, game.Status, game.TotalScore));
        Assert.Collection(game.Answers,
            first => Assert.Equal((1, true, true, 100, false), (first.Position, first.ArtistFound, first.TitleFound, first.Points, first.Neutralized)),
            second => Assert.Equal((2, false, false, 0), (second.Position, second.ArtistFound, second.TitleFound, second.Points)));
        Assert.Equal(_code, Assert.Single(runs.CreatedChallenges).Code);
        Assert.Equal(100, runs.Record!.BestScore);
        Assert.NotNull(runs.Access);
    }

    [Fact]
    public async Task Export_RienJoue_SectionVideMaisPresente()
    {
        var alice = await _game.NewPlayerAsync("Alice");

        var export = (await alice.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        var runs = ExportReading.Section<RunsDataExport>(export, "runs");
        Assert.Empty(runs.Games);
        Assert.Empty(runs.CreatedChallenges);
        Assert.Null(runs.Record);
        Assert.Null(runs.Access);
    }

    [Fact]
    public async Task Export_NeDonneQueSesDonnees()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        await AddRunAsync(bob.Id);

        var runs = ExportReading.Section<RunsDataExport>(
            (await alice.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!, "runs");

        Assert.Empty(runs.Games);
        Assert.Null(runs.Record);
    }

    [Fact]
    public async Task Effacement_SupprimePartiesReponsesRecordEtAcces_LesDefisRestentSansAuteur()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var bob = await _game.NewPlayerAsync("Bob");
        await AddRunAsync(alice.Id);
        await AddRunAsync(bob.Id);
        await _game.Api.ExecuteAsync($"UPDATE runs.challenges SET created_by = '{alice.Id}' WHERE id = {_challengeId}");

        var response = await alice.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Alice"), Ct);

        response.EnsureSuccessStatusCode();
        // Toutes les tables qui ont une colonne player_id, lues dans le schéma (piège 48) : celles de Runs en font partie.
        var tables = (await _game.Api.ScalarAsync<string[]>("""
            SELECT array_agg(table_schema || '.' || table_name) FROM information_schema.columns
            WHERE column_name = 'player_id' AND table_schema = 'runs'
            """))!;
        Assert.Equal(["runs.access", "runs.records", "runs.sessions"], tables.Order(StringComparer.Ordinal));
        foreach (var table in tables)
            Assert.Equal(0L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM {table} WHERE player_id = '{alice.Id}'"));
        // Seules les réponses de Bob restent ; son record et son accès aussi.
        Assert.Equal(2L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM runs.answers"));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.records WHERE player_id = '{bob.Id}'"));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.access WHERE player_id = '{bob.Id}'"));
        // Le défi qu'elle avait créé est toujours là, jouable, sans auteur.
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.challenges WHERE id = {_challengeId} AND created_by IS NULL"));
        Assert.Equal(20L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.challenge_tracks WHERE challenge_id = {_challengeId}"));
        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.sessions WHERE player_id = '{bob.Id}'"));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
