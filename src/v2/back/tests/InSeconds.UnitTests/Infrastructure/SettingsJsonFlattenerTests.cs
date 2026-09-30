using InSeconds.Api.Infrastructure.Settings;
using Microsoft.Extensions.Configuration;

namespace InSeconds.UnitTests.Infrastructure;

public class SettingsJsonFlattenerTests
{
    private sealed class DailyOptions
    {
        public int GuessTimerSeconds { get; set; }
        public decimal[] AllowedDurationsSeconds { get; set; } = [];
        public List<DurationScore> DurationScores { get; set; } = [];
        public Dictionary<int, int> HintPenaltyPercent { get; set; } = [];
        public string CoverUrlTemplate { get; set; } = "";
        public bool Enabled { get; set; }
    }

    private sealed class DurationScore
    {
        public decimal Seconds { get; set; }
        public int Score { get; set; }
    }

    [Fact]
    public void Flatten_LesValeursDuPlanV2_SeLientAuxOptions()
    {
        var data = new Dictionary<string, string?>();
        SettingsJsonFlattener.Flatten("Daily:GuessTimerSeconds", "20", data);
        SettingsJsonFlattener.Flatten("Daily:AllowedDurationsSeconds", "[0.5,1,1.5,2,3,5,10]", data);
        SettingsJsonFlattener.Flatten("Daily:DurationScores",
            """[{"seconds":0.5,"score":1000},{"seconds":1,"score":850},{"seconds":10,"score":100}]""", data);
        SettingsJsonFlattener.Flatten("Daily:HintPenaltyPercent", """{"1":30,"2":60}""", data);
        SettingsJsonFlattener.Flatten("Daily:CoverUrlTemplate", "\"https://cdn/{hash}.jpg\"", data);
        SettingsJsonFlattener.Flatten("Daily:Enabled", "true", data);

        var options = new ConfigurationBuilder().AddInMemoryCollection(data).Build()
            .GetSection("Daily").Get<DailyOptions>()!;

        Assert.Equal(20, options.GuessTimerSeconds);
        Assert.Equal([0.5m, 1m, 1.5m, 2m, 3m, 5m, 10m], options.AllowedDurationsSeconds);
        Assert.Equal([(0.5m, 1000), (1m, 850), (10m, 100)], options.DurationScores.Select(d => (d.Seconds, d.Score)));
        Assert.Equal(60, options.HintPenaltyPercent[2]);
        Assert.Equal("https://cdn/{hash}.jpg", options.CoverUrlTemplate);
        Assert.True(options.Enabled);
    }

    [Fact]
    public void Flatten_Tableau_ProduitUneEntreeParIndice()
    {
        var data = new Dictionary<string, string?>();

        SettingsJsonFlattener.Flatten("Daily:HintUnlockDurationsSeconds", "[5,10]", data);

        Assert.Equal("5", data["Daily:HintUnlockDurationsSeconds:0"]);
        Assert.Equal("10", data["Daily:HintUnlockDurationsSeconds:1"]);
        Assert.Equal(2, data.Count);
    }

    [Fact]
    public void Dictionnaire_AClesDecimales_NEstPasLieParLeBinder()
    {
        // Voilà pourquoi DurationScores est une liste d'objets : ce dictionnaire resterait vide, sans erreur.
        var data = new Dictionary<string, string?>();
        SettingsJsonFlattener.Flatten("Daily:Scores", """{"0.5":1000}""", data);

        var scores = new ConfigurationBuilder().AddInMemoryCollection(data).Build()
            .GetSection("Daily:Scores").Get<Dictionary<decimal, int>>();

        Assert.True(scores is null || scores.Count == 0);
    }

    [Fact]
    public void Flatten_JsonInvalide_Echoue()
    {
        // Une valeur illisible doit bloquer le démarrage plutôt que d'être ignorée en silence.
        Assert.ThrowsAny<System.Text.Json.JsonException>(() =>
            SettingsJsonFlattener.Flatten("Daily:GuessTimerSeconds", "vingt", new Dictionary<string, string?>()));
    }
}
