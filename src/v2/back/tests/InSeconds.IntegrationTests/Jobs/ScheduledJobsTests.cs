using Hangfire;
using Hangfire.Storage;
using InSeconds.Api.Infrastructure.Jobs;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Jobs;

public class ScheduledJobsTests(PostgresFixture postgres)
{
    /// <summary>
    /// Les tâches récurrentes de l'API et leur cron par défaut (tableau du § 5.4 bis du plan v2).
    /// Chaque module ajoute ici les siennes : catalogue-refresh (C1), daily-generate-challenge et
    /// daily-close-day (E1, E3), players-purge-expired-tokens (B3).
    /// </summary>
    private static readonly Dictionary<string, string> ExpectedJobs = [];

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

    private static List<RecurringJobDto> RecurringJobs(ApiFactory api)
    {
        using var connection = api.Services.GetRequiredService<JobStorage>().GetConnection();
        return connection.GetRecurringJobs();
    }
}
