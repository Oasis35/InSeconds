using System.Net;
using System.Net.Http.Json;
using InSeconds.Api.Infrastructure.Health;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.IntegrationTests;

public class HealthTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly DateTimeOffset FixedNow = new(2026, 9, 30, 12, 0, 0, TimeSpan.Zero);
    private ApiFactory _api = null!;

    public async ValueTask InitializeAsync() =>
        _api = new ApiFactory(await postgres.CreateDatabaseAsync(),
            services => services.AddSingleton<TimeProvider>(new FakeTimeProvider(FixedNow)));

    public ValueTask DisposeAsync() => _api.DisposeAsync();

    [Fact]
    public async Task Health_RenvoieLeMemeFormatQuEnV1()
    {
        var response = await _api.CreateClient().GetAsync("/health", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>(TestContext.Current.CancellationToken);
        Assert.Equal("ok", body!.Status);
        Assert.Equal(FixedNow, body.Utc);
        Assert.False(string.IsNullOrEmpty(body.Build));
    }

    [Fact]
    public async Task HealthReady_BaseJoignable_Healthy()
    {
        var response = await _api.CreateClient().GetAsync("/health/ready", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }
}
