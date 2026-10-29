using Hangfire;
using Hangfire.Storage;
using InSeconds.Api.Infrastructure.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace InSeconds.IntegrationTests.Jobs;

public class ScheduledJobsTests(PostgresFixture postgres)
{
    /// <summary>
    /// Les tâches récurrentes de l'API et leur cron par défaut (tableau « Tâches planifiées » du CLAUDE.md racine).
    /// Chaque module ajoute ici les siennes.
    /// </summary>
    private static readonly Dictionary<string, string> ExpectedJobs = new()
    {
        ["catalogue-refresh"] = "0 23 * * *",
        ["daily-close-day"] = "5 0 * * *",
        ["daily-generate-challenge"] = "0 0 * * *",
        ["players-purge-expired-tokens"] = "30 3 * * *",
    };

    [Fact]
    public async Task LApi_DeclareExactementLesTachesDuPlan()
    {
        await using var api = new ApiFactory(await postgres.CreateDatabaseAsync());

        var declared = api.Services.GetServices<ScheduledJobDefinition>()
            .ToDictionary(definition => definition.Id, definition => definition.DefaultCron);

        Assert.Equal(ExpectedJobs.OrderBy(j => j.Key), declared.OrderBy(j => j.Key));
        Assert.Equal(ExpectedJobs.Keys.Order(), RecurringJobs(api).Select(job => job.Id).Order());
    }

    [Fact]
    public async Task TacheDeclaree_EnregistreeEnUtc_AvecLeCronDeLaConfiguration()
    {
        await using var api = new ApiFactory(await postgres.CreateDatabaseAsync(),
            services => services
                .AddScheduledJob<SucceedingJob>("test-nightly", "0 4 * * *")
                .AddScheduledJob<FailingJob>("test-paused", "0 5 * * *"),
            settings: new Dictionary<string, string> { ["Jobs:test-paused:Cron"] = Cron.Never() });

        var jobs = RecurringJobs(api).ToDictionary(job => job.Id);

        Assert.Equal("0 4 * * *", jobs["test-nightly"].Cron);
        Assert.Equal(Cron.Never(), jobs["test-paused"].Cron);
        Assert.All(jobs.Values, job => Assert.Equal(TimeZoneInfo.Utc.Id, job.TimeZoneId));
    }

    [Fact]
    public async Task TacheQuiNEstPlusDeclaree_EstRetireeAuDemarrage()
    {
        var connectionString = await postgres.CreateDatabaseAsync();
        await using (var before = new ApiFactory(connectionString,
                         services => services.AddScheduledJob<SucceedingJob>("test-removed", "0 4 * * *")))
        {
            Assert.Contains(RecurringJobs(before), job => job.Id == "test-removed");
        }

        await using var after = new ApiFactory(connectionString);

        Assert.DoesNotContain(RecurringJobs(after), job => job.Id == "test-removed");
    }

    [Fact]
    public async Task EnStaging_CatalogueRefreshEnPause_AutresTachesDecaleesDe30MinSurLaProd()
    {
        // Piège 16 : le staging partage l'IP de la prod, donc le quota Deezer. Les autres tâches tournent 30 min après
        // celles de la prod (même VPS, même base PostgreSQL : jamais en même temps), dans le même ordre.
        await using var staging = new ApiFactory(await postgres.CreateDatabaseAsync(), environment: Environments.Staging,
            settings: TestCertificate.StagingSettings());

        var jobs = RecurringJobs(staging).ToDictionary(job => job.Id);

        Assert.Equal(Cron.Never(), jobs["catalogue-refresh"].Cron);
        Assert.Equal("0 4 * * *", jobs["players-purge-expired-tokens"].Cron);
        // La génération du défi n'appelle pas Deezer : elle tourne aussi sur le staging. Entre minuit et 0 h 30, le premier
        // « Commencer » génère le défi à la volée.
        Assert.Equal("30 0 * * *", jobs["daily-generate-challenge"].Cron);
        Assert.Equal("35 0 * * *", jobs["daily-close-day"].Cron);
    }

    [Fact]
    public async Task PlusieursApiDansLeMemeProcessus_NEmpilentPasLeFiltreDeTrace()
    {
        // Les filtres de Hangfire sont globaux au processus : un par API de test ferait déborder la pile du
        // serveur de tâches quand beaucoup d'API ont été créées avant.
        await using var first = new ApiFactory(await postgres.CreateDatabaseAsync());
        await using var second = new ApiFactory(await postgres.CreateDatabaseAsync());
        _ = first.Services;
        _ = second.Services;

        Assert.Single(GlobalJobFilters.Filters, filter => filter.Instance is JobTracingFilter);
    }

    private static List<RecurringJobDto> RecurringJobs(ApiFactory api)
    {
        using var connection = api.Services.GetRequiredService<JobStorage>().GetConnection();
        return connection.GetRecurringJobs();
    }
}
