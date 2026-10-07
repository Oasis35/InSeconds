using Hangfire;
using InSeconds.Api.Infrastructure.Jobs;
using InSeconds.Api.Infrastructure.Settings;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// La génération du défi du jour (§ 5.4 bis du plan v2) : le tirage sur le pool jouable hors cooldown, le même défi pour
/// la même graine, un seul défi par jour même quand deux générations se croisent, et le pool insuffisant. La commande
/// <c>GenerateDailyChallenge</c> est celle que lancent la tâche de minuit, le secours à la volée (E2) et le bouton de l'admin.
/// </summary>
public class GenerateChallengeTests(PostgresFixture postgres) : IAsyncLifetime
{
    private DailyApi _app = null!;

    public async ValueTask InitializeAsync()
    {
        _app = DailyApi.Create(await postgres.CreateDatabaseAsync());
        _ = _app.Api.Server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();

    [Fact]
    public async Task Genere_CinqMorceauxDistincts_AuxPositionsDe1A5_AvecLaGraineDuJourEtLOrigine()
    {
        await _app.AddPlayableTracksAsync(40);

        var result = await _app.GenerateAsync(origin: ChallengeOrigin.OnTheFly);

        Assert.Equal(GenerationOutcome.Created, result.Outcome);
        Assert.Equal((Today, 5, 40, 5), (result.Day, result.TrackCount, result.EligibleCount, result.Requested));
        var tracks = await _app.TracksOfAsync(Today);
        Assert.Equal(5, tracks.Count);
        Assert.Equal(5, tracks.Distinct().Count());
        Assert.All(tracks, id => Assert.InRange(id, 1, 40));
        Assert.Equal(Today.DayNumber, await _app.Api.ScalarAsync<int>("SELECT seed FROM daily.challenges"));
        Assert.Equal((short)ChallengeOrigin.OnTheFly, await _app.OriginOfAsync(Today));
        Assert.Equal(result.ChallengeId, await _app.Api.ScalarAsync<int>("SELECT id FROM daily.challenges"));
    }

    [Fact]
    public async Task MemeJourMemePool_MemeDefi_DansLeMemeOrdre()
    {
        await _app.AddPlayableTracksAsync(40);
        await _app.GenerateAsync();
        var first = await _app.TracksOfAsync(Today);

        await _app.Api.ExecuteAsync("DELETE FROM daily.challenges");
        await _app.GenerateAsync(origin: ChallengeOrigin.Admin);

        Assert.Equal(first, await _app.TracksOfAsync(Today));
    }

    [Fact]
    public async Task UnAutreJour_UnAutreDefi()
    {
        await _app.AddPlayableTracksAsync(40);

        await _app.GenerateAsync(Today);
        await _app.GenerateAsync(Today.AddDays(1));

        Assert.NotEqual(await _app.TracksOfAsync(Today), await _app.TracksOfAsync(Today.AddDays(1)));
    }

    [Fact]
    public async Task DefiDejaPresent_RienNeChange_ReponseAlreadyExists()
    {
        await _app.AddPlayableTracksAsync(40);
        var created = await _app.GenerateAsync();
        var tracks = await _app.TracksOfAsync(Today);

        var again = await _app.GenerateAsync(origin: ChallengeOrigin.Admin);

        Assert.Equal(GenerationOutcome.AlreadyExists, again.Outcome);
        Assert.Equal((created.ChallengeId, 5), (again.ChallengeId, again.TrackCount));
        Assert.Equal(tracks, await _app.TracksOfAsync(Today));
        Assert.Equal(1, await _app.ChallengeCountAsync());
        Assert.Equal((short)ChallengeOrigin.Nightly, await _app.OriginOfAsync(Today));
    }

    [Fact]
    public async Task Cooldown_LesMorceauxDesTrenteDerniersJoursNeSontPasTires()
    {
        await _app.AddPlayableTracksAsync(15);
        // 5 morceaux hier, 5 il y a 30 jours (limite, la v1 les exclut encore), 5 il y a 31 jours (de nouveau tirables).
        await _app.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);
        await _app.AddChallengeAsync(Today.AddDays(-30), 6, 7, 8, 9, 10);
        await _app.AddChallengeAsync(Today.AddDays(-31), 11, 12, 13, 14, 15);

        var result = await _app.GenerateAsync();

        // Seuls 11 à 15 restent : exactement les 5 nécessaires, dans un ordre mélangé.
        Assert.Equal(GenerationOutcome.Created, result.Outcome);
        Assert.Equal(5, result.EligibleCount);
        Assert.Equal([11, 12, 13, 14, 15], (await _app.TracksOfAsync(Today)).Order());
    }

    [Fact]
    public async Task Cooldown_ReglableParLesReglages_ReluAChaud()
    {
        await _app.AddPlayableTracksAsync(10);
        await _app.AddChallengeAsync(Today.AddDays(-5), 1, 2, 3, 4, 5);

        // 30 jours : les 5 morceaux de l'autre défi sont exclus, il en reste 5.
        Assert.Equal(5, (await _app.GenerateAsync(Today)).EligibleCount);

        // Un cooldown de 2 jours libère les 5 morceaux d'il y a 5 jours (réglage lu à chaud, pour le lendemain) ; ceux tirés
        // aujourd'hui restent exclus.
        await _app.Api.ExecuteAsync("""INSERT INTO infra.settings (key, value, description, updated_at) VALUES ('Daily:TrackCooldownDays', '2', '', now())""");
        _app.Api.Services.GetRequiredService<ISettingsReloader>().Reload();
        var later = await _app.GenerateAsync(Today.AddDays(1));

        Assert.Equal(5, later.EligibleCount);
        Assert.Equal([1, 2, 3, 4, 5], (await _app.TracksOfAsync(Today.AddDays(1))).Order());
    }

    [Fact]
    public async Task MorceauDesactive_SansExtrait_OuAExtraitInconnu_NEstJamaisTire()
    {
        await _app.AddPlayableTracksAsync(5, firstId: 1);
        await _app.AddTracksAsync(5, firstId: 6, previewStatus: 1, disabled: true);
        await _app.AddTracksAsync(5, firstId: 11, previewStatus: 2);
        await _app.AddTracksAsync(5, firstId: 16, previewStatus: 0);

        var result = await _app.GenerateAsync();

        Assert.Equal((GenerationOutcome.Created, 5), (result.Outcome, result.EligibleCount));
        Assert.Equal([1, 2, 3, 4, 5], (await _app.TracksOfAsync(Today)).Order());
    }

    [Fact]
    public async Task PoolInsuffisant_RienNEstEcrit_LeCompteRenduDitCombienIlEnManque()
    {
        await _app.AddPlayableTracksAsync(4);

        var result = await _app.GenerateAsync();

        Assert.Equal(GenerationOutcome.PoolInsufficient, result.Outcome);
        Assert.Equal((4, 5, null), (result.EligibleCount, result.Requested, result.ChallengeId));
        Assert.Equal(0, await _app.ChallengeCountAsync());
    }

    [Fact]
    public async Task PoolInsuffisantParLeCooldown_LeDefiNeRetireJamaisDeMorceauEnCooldown()
    {
        await _app.AddPlayableTracksAsync(8);
        await _app.AddChallengeAsync(Today.AddDays(-1), 1, 2, 3, 4, 5);

        var result = await _app.GenerateAsync();

        Assert.Equal((GenerationOutcome.PoolInsufficient, 3), (result.Outcome, result.EligibleCount));
        Assert.Equal(1, await _app.ChallengeCountAsync());
    }

    [Fact]
    public async Task PoolRegarni_LaGenerationSuivanteReussit()
    {
        await _app.AddPlayableTracksAsync(4);
        Assert.Equal(GenerationOutcome.PoolInsufficient, (await _app.GenerateAsync()).Outcome);

        await _app.AddPlayableTracksAsync(2, firstId: 5);

        Assert.Equal(GenerationOutcome.Created, (await _app.GenerateAsync()).Outcome);
    }

    [Fact]
    public async Task NombreDeMorceaux_LuDansLesReglages()
    {
        await _app.DisposeAsync();
        _app = DailyApi.Create(await postgres.CreateDatabaseAsync(), new Dictionary<string, string> { ["Daily:TracksPerChallenge"] = "3" });
        _ = _app.Api.Server;
        await _app.AddPlayableTracksAsync(10);

        var result = await _app.GenerateAsync();

        Assert.Equal((3, 3), (result.TrackCount, result.Requested));
        Assert.Equal(3, (await _app.TracksOfAsync(Today)).Count);
    }

    [Fact]
    public async Task UnMorceauNePeutEtreSupprime_DesQuilEstDansUnDefi()
    {
        await _app.AddPlayableTracksAsync(10);
        await _app.GenerateAsync();
        var used = (await _app.TracksOfAsync(Today))[0];

        // Le contrat de Catalogue le dit (409 catalogue.track_in_use), la clé étrangère le garantit en dernier recours.
        var delete = await _app.Admin().DeleteAsync($"/api/admin/catalogue/tracks/{used}", Ct);
        Assert.Equal(System.Net.HttpStatusCode.Conflict, delete.StatusCode);
        var directDelete = await Assert.ThrowsAnyAsync<Exception>(() => _app.Api.ExecuteAsync($"DELETE FROM catalogue.tracks WHERE id = {used}"));
        Assert.Contains("fk_challenge_tracks_tracks_track_id", directDelete.Message);
    }

    // --- deux générations qui se croisent ---

    [Fact]
    public async Task Course_DeuxGenerationsSimultanees_UnSeulDefi_LaSecondeAttendEtVoitLeDefiDeLaPremiere()
    {
        await _app.DisposeAsync();
        var selector = new SlowSelector(TimeSpan.FromMilliseconds(700));
        _app = DailyApi.Create(await postgres.CreateDatabaseAsync(),
            configureServices: services => services.Replace(ServiceDescriptor.Singleton<ITrackSelector>(selector)));
        _ = _app.Api.Server;
        await _app.AddPlayableTracksAsync(40);

        // Le tirage prend 700 ms : la seconde génération démarre pendant que la première le calcule.
        var generations = Enumerable.Range(0, 4)
            .Select(i => _app.GenerateAsync(origin: i % 2 == 0 ? ChallengeOrigin.Nightly : ChallengeOrigin.OnTheFly))
            .ToArray();
        var results = await Task.WhenAll(generations);

        Assert.Single(results, r => r.Outcome == GenerationOutcome.Created);
        Assert.Equal(3, results.Count(r => r.Outcome == GenerationOutcome.AlreadyExists));
        Assert.All(results, r => Assert.Equal(results.Single(x => x.Outcome == GenerationOutcome.Created).ChallengeId, r.ChallengeId));
        // Les perdantes n'ont même pas tiré : elles ont attendu le verrou, puis vu le défi de la gagnante.
        Assert.Equal(1, selector.Calls);
        Assert.Equal(1, await _app.ChallengeCountAsync());
        Assert.Equal(5, (await _app.TracksOfAsync(Today)).Count);
        Assert.Equal(5, await _app.Api.ScalarAsync<long>("SELECT count(*) FROM daily.challenge_tracks"));
    }

    [Fact]
    public async Task Course_DeuxJoursDifferents_NeSAttendentPas()
    {
        await _app.DisposeAsync();
        var selector = new SlowSelector(TimeSpan.FromMilliseconds(500));
        _app = DailyApi.Create(await postgres.CreateDatabaseAsync(),
            configureServices: services => services.Replace(ServiceDescriptor.Singleton<ITrackSelector>(selector)));
        _ = _app.Api.Server;
        await _app.AddPlayableTracksAsync(40);

        await Task.WhenAll(_app.GenerateAsync(Today), _app.GenerateAsync(Today.AddDays(1)));

        Assert.Equal(2, selector.Calls);
        Assert.Equal(2, await _app.ChallengeCountAsync());
        // Le verrou est par jour : les deux tirages ont été en cours en même temps (pas une durée, trop fragile sous charge).
        Assert.Equal(2, selector.MaxConcurrent);
    }

    // --- la tâche de minuit et celle du bouton ---

    [Fact]
    public async Task TacheDeMinuit_GenereLeDefiDuJourDeLHorloge_OrigineNocturne_CompteRenduDuDictionnaire()
    {
        await _app.AddPlayableTracksAsync(40);

        object? report;
        using (var scope = _app.Api.Services.CreateScope())
            report = await scope.ServiceProvider.GetRequiredService<GenerateDailyChallengeJob>().RunAsync(Ct);

        var dictionary = Assert.IsType<Dictionary<string, object?>>(report);
        Assert.Equal((true, "2026-10-05", 5), (dictionary["created"], dictionary["date"], dictionary["tracks"]));
        Assert.Equal((short)ChallengeOrigin.Nightly, await _app.OriginOfAsync(Today));

        // Le lendemain, à minuit : le défi du jour suivant.
        _app.Time.Advance(TimeSpan.FromHours(12));
        using (var scope = _app.Api.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<GenerateDailyChallengeJob>().RunAsync(Ct);
        Assert.Equal(5, (await _app.TracksOfAsync(Today.AddDays(1))).Count);
    }

    [Fact]
    public async Task TacheDeMinuit_DefiDejaGenere_ReussitSansRienChanger()
    {
        await _app.AddPlayableTracksAsync(40);
        await _app.GenerateAsync(origin: ChallengeOrigin.OnTheFly);

        using var scope = _app.Api.Services.CreateScope();
        var report = (Dictionary<string, object?>)(await scope.ServiceProvider.GetRequiredService<GenerateDailyChallengeJob>().RunAsync(Ct))!;

        Assert.Equal(false, report["created"]);
        Assert.Equal(1, await _app.ChallengeCountAsync());
        Assert.Equal((short)ChallengeOrigin.OnTheFly, await _app.OriginOfAsync(Today));
    }

    [Fact]
    public async Task TacheDeMinuit_PoolInsuffisant_LeveUneException_PourQueHangfireReessaie()
    {
        await _app.AddPlayableTracksAsync(2);

        using var scope = _app.Api.Services.CreateScope();
        var failure = await Assert.ThrowsAsync<JobFailedException>(() => scope.ServiceProvider.GetRequiredService<GenerateDailyChallengeJob>().RunAsync(Ct));

        Assert.Equal("admin.pool_insufficient", failure.Code);
    }

    [Fact]
    public async Task TacheDuBouton_MarqueLeDefiAdmin_EtLeveLaMemeException()
    {
        await _app.AddPlayableTracksAsync(2);
        using (var scope = _app.Api.Services.CreateScope())
        {
            var failure = await Assert.ThrowsAsync<JobFailedException>(() => scope.ServiceProvider.GetRequiredService<GenerateDailyChallengeAdminJob>().RunAsync(Ct));
            Assert.Equal("admin.pool_insufficient", failure.Code);
        }

        await _app.AddPlayableTracksAsync(40, firstId: 3);
        using (var scope = _app.Api.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<GenerateDailyChallengeAdminJob>().RunAsync(Ct);

        Assert.Equal((short)ChallengeOrigin.Admin, await _app.OriginOfAsync(Today));
    }

    [Fact]
    public void TacheDeMinuit_ReessaieToutesLes10Minutes_AssezDeFoisPourCouvrirLaJournee()
    {
        var retry = typeof(GenerateDailyChallengeJob).GetMethod(nameof(GenerateDailyChallengeJob.RunAsync))!
            .GetCustomAttributes(typeof(AutomaticRetryAttribute), inherit: false).Cast<AutomaticRetryAttribute>().Single();

        Assert.Equal([600], retry.DelaysInSeconds);
        // Le défaut de Hangfire s'arrête à 10 essais, soit 1 h 40 : un pool vide ce soir-là laisserait la journée sans défi.
        Assert.True(retry.Attempts * 10 >= 24 * 60, $"{retry.Attempts} essais ne couvrent pas la journée.");
    }

    [Fact]
    public void TacheDuBouton_NeReessaiePas_L_AdminVoitTout_deSuiteLeResultat()
    {
        var retry = typeof(GenerateDailyChallengeAdminJob).GetMethod(nameof(GenerateDailyChallengeAdminJob.RunAsync))!
            .GetCustomAttributes(typeof(AutomaticRetryAttribute), inherit: false).Cast<AutomaticRetryAttribute>().Single();

        Assert.Equal(0, retry.Attempts);
    }

    /// <summary>Un sélecteur qui prend son temps, pour qu'une seconde génération démarre pendant que la première tire.</summary>
    private sealed class SlowSelector(TimeSpan delay) : ITrackSelector
    {
        private int _calls;
        private int _running;
        private int _maxConcurrent;

        public int Calls => _calls;

        /// <summary>Le plus grand nombre de tirages en cours au même moment.</summary>
        public int MaxConcurrent => _maxConcurrent;

        public TrackSelection Select(IEnumerable<int> candidates, IReadOnlySet<int> inCooldown, int count, int seed)
        {
            Interlocked.Increment(ref _calls);
            var running = Interlocked.Increment(ref _running);
            int seen;
            while (running > (seen = Volatile.Read(ref _maxConcurrent)) && Interlocked.CompareExchange(ref _maxConcurrent, running, seen) != seen)
            {
            }

            Thread.Sleep(delay);
            Interlocked.Decrement(ref _running);
            return new CooldownSeededSelector(new InSeconds.Api.Modules.Gameplay.Domain.FisherYatesShuffle()).Select(candidates, inCooldown, count, seed);
        }
    }
}
