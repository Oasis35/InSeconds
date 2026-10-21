using System.Text.Json;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using InSeconds.IntegrationTests.Daily;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Le défi d'un run : tirage dans tout le catalogue jouable par tranches de rang Deezer, règles figées en <c>jsonb</c>, code unique, créateur effaçable.
/// Aucune route ne crée encore de défi (la partie arrive ensuite) : le planificateur est appelé directement, comme les tâches dans les autres tests.
/// </summary>
public class RunChallengeTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync() => _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 0);

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    /// <summary>100 morceaux jouables (1 à 100), le rang décroît avec l'identifiant : le 1 est le plus connu.</summary>
    private async Task AddRankedPoolAsync(int count = 100)
    {
        await _game.App.AddPlayableTracksAsync(count);
        await _game.Api.ExecuteAsync($"UPDATE catalogue.tracks SET deezer_rank = 1000000 - id * 1000 WHERE id <= {count}");
    }

    private async Task<(PlanResult Plan, int Id)> CreateAsync(Guid? createdBy = null)
    {
        using var scope = _game.Api.Services.CreateScope();
        var plan = await scope.ServiceProvider.GetRequiredService<RunChallengePlanner>().PlanAsync(createdBy, Ct);
        if (plan.Challenge is null)
            return (plan, 0);
        scope.ServiceProvider.GetRequiredService<IRunsStore>().AddChallenge(plan.Challenge);
        await scope.ServiceProvider.GetRequiredService<InSecondsDbContext>().SaveChangesAsync(Ct);
        return (plan, plan.Challenge.Id);
    }

    [Fact]
    public async Task Cree_VingtMorceauxEnQuatreManches_DansLOrdreDuJeu()
    {
        await AddRankedPoolAsync();

        var (plan, id) = await CreateAsync();

        Assert.NotNull(plan.Challenge);
        var rows = await _game.Api.ScalarAsync<string>(
            $"SELECT string_agg(round || ':' || multiplier, ',' ORDER BY position) FROM runs.challenge_tracks WHERE challenge_id = {id}");
        Assert.Equal(
            string.Join(',', Enumerable.Range(1, 4).SelectMany(round => Enumerable.Repeat($"{round}:{new[] { "1.00", "1.33", "1.67", "2.00" }[round - 1]}", 5))),
            rows);
        Assert.Equal(20, await _game.Api.ScalarAsync<long>($"SELECT count(DISTINCT track_id) FROM runs.challenge_tracks WHERE challenge_id = {id}"));
    }

    [Fact]
    public async Task ChaqueManche_TireDansSaTrancheDeRang()
    {
        await AddRankedPoolAsync();

        var (_, id) = await CreateAsync();

        // 100 morceaux, 4 tranches de 25 par rang décroissant : la manche k tire dans les identifiants (k-1)×25+1 à k×25.
        var outside = await _game.Api.ScalarAsync<long>(
            $"SELECT count(*) FROM runs.challenge_tracks WHERE challenge_id = {id} AND (track_id - 1) / 25 + 1 <> round");
        Assert.Equal(0L, outside);
    }

    [Fact]
    public async Task TireDansToutLeCatalogueJouable_DailyCompris_PasLesMorceauxDesactivesOuSansExtrait()
    {
        await AddRankedPoolAsync(20);
        // Un morceau désactivé et un morceau sans extrait, très connus : ils ne sont jamais tirés.
        await _game.App.AddTracksAsync(1, 101, previewStatus: 1, disabled: true);
        await _game.App.AddTracksAsync(1, 102, previewStatus: 2);
        await _game.Api.ExecuteAsync("UPDATE catalogue.tracks SET deezer_rank = 5000000 WHERE id > 100");
        // Tous les morceaux sont au Daily d'aujourd'hui (cooldown) : Runs les tire quand même.
        await _game.App.AddChallengeAsync(DailyApi.Today, 1, 2, 3, 4, 5);

        var (plan, id) = await CreateAsync();

        Assert.True(plan.EligibleCount == 20, $"{plan.EligibleCount}");
        Assert.Equal(
            Enumerable.Range(1, 20), (await _game.Api.ScalarAsync<int[]>($"SELECT array_agg(track_id ORDER BY track_id) FROM runs.challenge_tracks WHERE challenge_id = {id}"))!);
    }

    [Fact]
    public async Task PoolInsuffisant_AucunDefi()
    {
        await AddRankedPoolAsync(19);

        var (plan, _) = await CreateAsync();

        Assert.Null(plan.Challenge);
        Assert.Equal((19, 20), (plan.EligibleCount, plan.Requested));
        Assert.Equal(0L, await _game.Api.ScalarAsync<long>("SELECT count(*) FROM runs.challenges"));
    }

    [Fact]
    public async Task LeCode_SixCaracteresDeLAlphabet_LaGraineEtLesReglesSontFigees()
    {
        await AddRankedPoolAsync();
        var author = await _game.NewPlayerAsync("Auteur");

        var (_, id) = await CreateAsync(author.Id);

        var code = await _game.Api.ScalarAsync<string>($"SELECT code FROM runs.challenges WHERE id = {id}");
        Assert.Equal(code, RunChallengeCode.Normalize(code));
        Assert.Equal(author.Id, await _game.Api.ScalarAsync<Guid>($"SELECT created_by FROM runs.challenges WHERE id = {id}"));
        var rules = JsonSerializer.Deserialize<RunRules>(
            (await _game.Api.ScalarAsync<string>($"SELECT rules::text FROM runs.challenges WHERE id = {id}"))!, JsonSerializerOptions.Web)!;
        Assert.Equal(RunsOptions.DefaultRules().Rounds, rules.Rounds);
        Assert.Equal([40, 50, 60, 70], rules.ThresholdPercents);
        Assert.Equal(10m, rules.ListenSeconds);
        Assert.Equal("jsonb", await _game.Api.ScalarAsync<string>(
            "SELECT data_type FROM information_schema.columns WHERE table_schema = 'runs' AND table_name = 'challenges' AND column_name = 'rules'"));
    }

    [Fact]
    public async Task UnReglageChangeAChaud_NeToucheJamaisUnDefiExistant_SeulLeSuivantLePrend()
    {
        await AddRankedPoolAsync();
        var (_, first) = await CreateAsync();

        await _game.SetSettingAsync("Runs:TracksPerRound", "3");
        var (_, second) = await CreateAsync();

        Assert.Equal(20L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.challenge_tracks WHERE challenge_id = {first}"));
        Assert.Equal(5, await _game.Api.ScalarAsync<int>($"SELECT (rules->>'tracksPerRound')::int FROM runs.challenges WHERE id = {first}"));
        Assert.Equal(12L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.challenge_tracks WHERE challenge_id = {second}"));
        Assert.Equal(3, await _game.Api.ScalarAsync<int>($"SELECT (rules->>'tracksPerRound')::int FROM runs.challenges WHERE id = {second}"));
    }

    [Fact]
    public async Task UnReglageIncoherentAChaud_RetombeSurLesDefauts()
    {
        await AddRankedPoolAsync();
        await _game.SetSettingAsync("Runs:Rounds", "0");

        var (plan, _) = await CreateAsync();

        Assert.Equal(20, plan.Challenge!.Tracks.Count);
        Assert.Equal(4, plan.Challenge.Rules.Rounds);
    }

    [Fact]
    public async Task DeuxDefis_ONtDeuxCodesDifferents_EtLIndexUniqueRefuseUnDoublon()
    {
        await AddRankedPoolAsync();
        var (first, _) = await CreateAsync();
        var (second, _) = await CreateAsync();

        Assert.NotEqual(first.Challenge!.Code, second.Challenge!.Code);
        await Assert.ThrowsAnyAsync<Exception>(() => _game.Api.ExecuteAsync(
            $"INSERT INTO runs.challenges (id, code, seed, rules, created_at) VALUES (nextval('runs.challenges_hilo'), '{first.Challenge.Code}', 1, '{{}}', now())"));
    }

    [Fact]
    public async Task LAuteurSupprime_LeDefiResteJouable_SansAuteur()
    {
        await AddRankedPoolAsync();
        var author = await _game.NewPlayerAsync("Auteur");
        var (_, id) = await CreateAsync(author.Id);

        await _game.Api.ExecuteAsync($"DELETE FROM players.accounts WHERE player_id = '{author.Id}'");
        await _game.Api.ExecuteAsync($"DELETE FROM players.players WHERE id = '{author.Id}'");

        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.challenges WHERE id = {id} AND created_by IS NULL"));
        Assert.Equal(20L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.challenge_tracks WHERE challenge_id = {id}"));
    }

    [Fact]
    public async Task UneSeuleParty_ParJoueurEtParDefi()
    {
        await AddRankedPoolAsync();
        var (_, id) = await CreateAsync();
        var alice = await _game.NewPlayerAsync("Alice");
        var insert = $"INSERT INTO runs.sessions (id, challenge_id, player_id, status, rounds_passed, total_score, started_at) VALUES (nextval('runs.sessions_hilo'), {id}, '{alice.Id}', 0, 0, 0, now())";
        await _game.Api.ExecuteAsync(insert);

        await Assert.ThrowsAnyAsync<Exception>(() => _game.Api.ExecuteAsync(insert));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
