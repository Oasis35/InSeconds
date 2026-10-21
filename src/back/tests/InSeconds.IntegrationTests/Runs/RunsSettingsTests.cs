using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>Les réglages <c>Runs:</c> au démarrage de l'API : des réglages incohérents l'empêchent de démarrer, les valeurs par défaut suffisent.</summary>
public class RunsSettingsTests(PostgresFixture postgres) : IAsyncLifetime
{
    private string _connectionString = null!;

    public async ValueTask InitializeAsync() => _connectionString = await postgres.CreateDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Demarrage_ReglagesParDefaut_Demarre()
    {
        await using var api = new ApiFactory(_connectionString);

        _ = api.Server;
    }

    [Theory]
    [InlineData("Runs:Rounds", "0", "Runs:Rounds")]
    [InlineData("Runs:TracksPerRound", "0", "Runs:TracksPerRound")]
    [InlineData("Runs:ListenSeconds", "0", "Runs:ListenSeconds")]
    [InlineData("Runs:ThresholdPercents:0", "0", "Runs:ThresholdPercents")]
    [InlineData("Runs:MinMultiplier", "3", "Runs:MinMultiplier")]
    [InlineData("Runs:Discs:0", " ", "Runs:Discs")]
    public async Task Demarrage_ReglageIncoherent_RefuseDeDemarrer(string key, string value, string expected)
    {
        await using var api = new ApiFactory(_connectionString, settings: new Dictionary<string, string> { [key] = value });

        var exception = Assert.ThrowsAny<Exception>(() => api.Server);

        var validation = Assert.Single(Unwrap(exception).OfType<OptionsValidationException>());
        Assert.Contains(expected, validation.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Demarrage_ListesDeReglagesCompletes_NAjoutentRienAuxValeursParDefaut()
    {
        // Le binder AJOUTE les éléments lus à ceux de la valeur initiale : les listes n'en ont pas (le défaut est dans Effective…).
        await using var api = new ApiFactory(_connectionString, settings: new Dictionary<string, string>
        {
            ["Runs:ThresholdPercents:0"] = "30",
            ["Runs:ThresholdPercents:1"] = "40",
            ["Runs:ThresholdPercents:2"] = "50",
            ["Runs:ThresholdPercents:3"] = "60",
        });

        var options = api.Services.GetRequiredService<IOptionsMonitor<InSeconds.Api.Modules.Runs.Application.RunsOptions>>().CurrentValue;

        Assert.Equal([30, 40, 50, 60], options.EffectiveThresholdPercents);
    }

    private static IEnumerable<Exception> Unwrap(Exception exception)
    {
        for (var e = exception; e is not null; e = e.InnerException!)
        {
            yield return e;
            if (e.InnerException is null)
                yield break;
        }
    }
}
