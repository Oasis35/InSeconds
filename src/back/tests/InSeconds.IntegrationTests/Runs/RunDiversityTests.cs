using InSeconds.IntegrationTests.Daily;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// La diversité du tirage par HTTP : la partie d'après d'un joueur évite les morceaux de la précédente, sans jamais bloquer le tirage, et sans lire ni
/// toucher les parties d'un autre joueur.
/// </summary>
public class RunDiversityTests(PostgresFixture postgres) : IAsyncLifetime
{
    private RunGame _run = null!;

    public async ValueTask InitializeAsync() =>
        _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 160, settings: new Dictionary<string, string>(RunGame.SeriesRules));

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private async Task<int[]> FirstRoundAsync(string code) =>
        [await _run.TrackAtAsync(code, 1), await _run.TrackAtAsync(code, 2), await _run.TrackAtAsync(code, 3)];

    [Fact]
    public async Task LaPartieSuivante_EviteLesMorceauxDeLaPrecedente()
    {
        var alice = await _run.NewInvitedAsync("Alice");
        var first = (await alice.LaunchAsync()).Session;
        var heard = await FirstRoundAsync(first.ChallengeCode);
        await alice.PlayAsync(first.SessionId, first.ChallengeCode, 1, true, true, true);
        await alice.AbandonRawAsync(first.SessionId);

        var second = (await alice.LaunchAsync()).Session;

        Assert.Empty((await FirstRoundAsync(second.ChallengeCode)).Intersect(heard));
    }

    [Fact]
    public async Task UnPetitPool_RelacheLaRegle_LaPartieSeLanceQuandMeme()
    {
        // 12 morceaux : la première tranche n'en a que 1 ou 2, tous entendus ; la manche se tire quand même (les plus anciens reviennent).
        await using var small = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 12, settings: new Dictionary<string, string>(RunGame.SeriesRules));
        var alice = await small.NewInvitedAsync("Alice");
        var first = (await alice.LaunchAsync()).Session;
        await alice.PlayAsync(first.SessionId, first.ChallengeCode, 1, true, true, true);
        await alice.AbandonRawAsync(first.SessionId);

        var second = (await alice.LaunchAsync()).Session;

        Assert.Equal(3, new[] { await small.TrackAtAsync(second.ChallengeCode, 1), await small.TrackAtAsync(second.ChallengeCode, 2), await small.TrackAtAsync(second.ChallengeCode, 3) }.Distinct().Count());
    }

    [Fact]
    public async Task SansLaDiversite_LaMemoireNeSertARien_LaPartieSeLanceCommeAvant()
    {
        var settings = new Dictionary<string, string>(RunGame.SeriesRules) { ["Runs:Diversity:PoolPercent"] = "0" };
        await using var off = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 160, settings: settings);
        var alice = await off.NewInvitedAsync("Alice");
        var first = (await alice.LaunchAsync()).Session;
        await alice.PlayAsync(first.SessionId, first.ChallengeCode, 1, true, true, true);
        await alice.AbandonRawAsync(first.SessionId);

        var second = (await alice.LaunchAsync()).Session;

        Assert.Equal(3, new[] { await off.TrackAtAsync(second.ChallengeCode, 1), await off.TrackAtAsync(second.ChallengeCode, 2), await off.TrackAtAsync(second.ChallengeCode, 3) }.Distinct().Count());
    }

    [Fact]
    public async Task LeThemeJoueALaPartieDAvant_NEstPlusProposeQuandIlEnResteAssez()
    {
        // Quatre thèmes de 40 morceaux : au plus un thème est écarté (il en reste au moins trois pour proposer un choix).
        await _run.Api.ExecuteAsync("INSERT INTO catalogue.themes (id, name, created_at) VALUES (1, 'A', now()), (2, 'B', now()), (3, 'C', now()), (4, 'D', now())");
        await _run.Api.ExecuteAsync("INSERT INTO catalogue.track_themes (track_id, theme_id) SELECT id, (id - 1) / 40 + 1 FROM catalogue.tracks WHERE id <= 160");
        var alice = await _run.NewInvitedAsync("Alice");
        var first = (await alice.LaunchAsync()).Session;
        var atRound2 = await alice.PlayAsync(first.SessionId, first.ChallengeCode, 1, true, true, true);
        var chosen = atRound2.Session.ThemeChoice!.Themes[0].Id;
        await alice.ThemeAsync(first.SessionId, 2, chosen);
        await alice.PlayAsync(first.SessionId, first.ChallengeCode, 4, true, true, true);
        await alice.AbandonRawAsync(first.SessionId);

        var second = (await alice.LaunchAsync()).Session;
        var offer = (await alice.PlayAsync(second.SessionId, second.ChallengeCode, 1, true, true, true)).Session.ThemeChoice!;

        Assert.DoesNotContain(offer.Themes, t => t.Id == chosen);
    }
}
