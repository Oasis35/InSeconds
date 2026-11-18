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
    [InlineData("Runs:Lives", "0", "Runs:Lives")]
    [InlineData("Runs:TracksPerRound", "0", "Runs:TracksPerRound")]
    [InlineData("Runs:ListenLadder:0", "0", "Runs:ListenLadder")]
    [InlineData("Runs:StepPoints:0", "0", "Runs:StepPoints")]
    [InlineData("Runs:Levels:OldWeightPercent", "30", "Runs:Levels:OldWeightPercent")]
    [InlineData("Runs:Levels:InactivityGraceDays", "0", "Runs:Levels:InactivityGraceDays")]
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
            ["Runs:ListenLadder:0"] = "8",
            ["Runs:ListenLadder:1"] = "4",
            ["Runs:ListenLadder:2"] = "2",
            ["Runs:StepPoints:0"] = "100",
            ["Runs:StepPoints:1"] = "300",
            ["Runs:StepPoints:2"] = "900",
        });

        var options = api.Services.GetRequiredService<IOptionsMonitor<InSeconds.Api.Modules.Runs.Application.RunsOptions>>().CurrentValue;

        Assert.Equal([8m, 4m, 2m], options.EffectiveListenLadder);
        Assert.Equal([100, 300, 900], options.EffectiveStepPoints);
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
