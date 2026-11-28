using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.UnitTests.Support;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace InSeconds.UnitTests.Daily;

/// <summary>Le barème et les règles du défi du jour lues dans les réglages.</summary>
public class DailyScoringAndRulesTests
{
    private static readonly DailyOptions Defaults = new();

    private static DurationScoringPolicy Policy() =>
        new(Defaults.EffectiveDurationScores, Defaults.RetryScorePercent);

    // --- le barème ---

    [Theory]
    [InlineData(0.5, 1000)]
    [InlineData(1, 850)]
    [InlineData(1.5, 700)]
    [InlineData(2, 550)]
    [InlineData(3, 400)]
    [InlineData(5, 250)]
    [InlineData(10, 100)]
    public void Score_ArtisteEtTitre_LeBaremeDuPalier(double seconds, int expected) =>
        Assert.Equal(expected, Policy().Score(new RoundOutcome(true, true, (decimal)seconds)));

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void Score_UnSeulDesDeux_LaMoitie(bool artist, bool title) =>
        Assert.Equal(425, Policy().Score(new RoundOutcome(artist, title, 1)));

    [Fact]
    public void Score_RienDeTrouve_ZeroPoint() =>
        Assert.Equal(0, Policy().Score(new RoundOutcome(false, false, 0.5m)));

    [Fact]
    public void Score_PalierInconnuOuPasse_ZeroPoint()
    {
        Assert.Equal(0, Policy().Score(new RoundOutcome(true, true, 4)));
        Assert.Equal(0, Policy().Score(new RoundOutcome(true, true, 0)));
    }

    // --- la seconde tentative : 70 % du score du dernier palier écouté, la moitié s'applique comme avant ---

    [Theory]
    [InlineData(2, 385)] // 550 × 0,7
    [InlineData(5, 175)] // 250 × 0,7 : le palier du dernier écouté, pas celui de la première tentative
    public void Score_SecondeTentative_LeDernierPalierEcoute_FoisLePourcentage(double seconds, int expected) =>
        Assert.Equal(expected, Policy().Score(new RoundOutcome(true, true, (decimal)seconds), isRetry: true));

    [Fact]
    public void Score_SecondeTentative_UneMoitie_PuisLePourcentage_ArrondiAuPairLePlusProche()
    {
        // 250 × 0,5 = 125 ; 125 × 0,7 = 87,5 → 88.
        Assert.Equal(88, Policy().Score(new RoundOutcome(true, false, 5), isRetry: true));
        // 550 × 0,5 = 275 ; 275 × 0,7 = 192,5 → 192.
        Assert.Equal(192, Policy().Score(new RoundOutcome(false, true, 2), isRetry: true));
    }

    [Fact]
    public void Score_SecondeTentative_RienDeTrouve_ZeroPoint() =>
        Assert.Equal(0, Policy().Score(new RoundOutcome(false, false, 1), isRetry: true));

    [Fact]
    public void Score_SansSecondeTentative_LePourcentageNeSAppliquePas() =>
        Assert.Equal(550, Policy().Score(new RoundOutcome(true, true, 2)));

    [Fact]
    public void Score_UnPalierEcritDeuxFois_LeDernierL_Emporte_SansException()
    {
        var policy = new DurationScoringPolicy([new DurationScore(1, 100), new DurationScore(1, 300)], 70);

        Assert.Equal(300, policy.Score(new RoundOutcome(true, true, 1)));
    }

    // --- les réglages ---

    [Fact]
    public void ParDefaut_LesValeursDuJeu()
    {
        Assert.Equal([0.5m, 1m, 1.5m, 2m, 3m, 5m, 10m], Defaults.EffectiveAllowedDurationsSeconds);
        Assert.Equal(7, Defaults.StreakRules.FreezeEveryDays);
        Assert.Equal(2, Defaults.StreakRules.FreezeMax);
        Assert.Equal(2, Defaults.StreakRules.LostNudgeMinDays);
        Assert.Equal(20, Defaults.GuessTimerSeconds);
        Assert.Equal(70, Defaults.RetryScorePercent);
    }

    [Theory]
    [InlineData(0, true)] // pas de seconde tentative
    [InlineData(70, true)]
    [InlineData(100, true)]
    [InlineData(-1, false)]
    [InlineData(101, false)]
    public void RetryScorePercent_DeZeroACent(int percent, bool valid)
    {
        var problems = DailyOptionsChecks.Problems(new DailyOptions { RetryScorePercent = percent });

        Assert.Equal(valid, problems.All(p => !p.Contains("RetryScorePercent")));
    }

    [Fact]
    public void Binder_RemplaceLesListes_ilNeLesAjouteJamaisAuxValeursParDefaut()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Daily:AllowedDurationsSeconds:0"] = "1",
            ["Daily:AllowedDurationsSeconds:1"] = "2",
            ["Daily:DurationScores:0:Seconds"] = "1",
            ["Daily:DurationScores:0:Score"] = "500",
        }).Build();

        var options = configuration.GetSection(DailyOptions.Section).Get<DailyOptions>()!;

        Assert.Equal([1m, 2m], options.EffectiveAllowedDurationsSeconds);
        Assert.Equal([new DurationScore(1, 500)], options.EffectiveDurationScores);
    }

    [Fact]
    public void ListesVidesOuAberrantes_RetombentSurLesPaliersParDefaut()
    {
        Assert.Equal(DailyOptions.DefaultAllowedDurationsSeconds, new DailyOptions { AllowedDurationsSeconds = [] }.EffectiveAllowedDurationsSeconds);
        Assert.Equal(DailyOptions.DefaultAllowedDurationsSeconds, new DailyOptions { AllowedDurationsSeconds = [1, -2] }.EffectiveAllowedDurationsSeconds);
        Assert.Equal(DailyOptions.DefaultDurationScores, new DailyOptions { DurationScores = [] }.EffectiveDurationScores);
    }

    [Fact]
    public void PaliersTries_SansDoublon()
    {
        Assert.Equal([1m, 2m, 3m], new DailyOptions { AllowedDurationsSeconds = [3, 1, 2, 1] }.EffectiveAllowedDurationsSeconds);
    }

    [Theory]
    [InlineData(0.333)] // relu 0,33 depuis numeric(4,2) : la réponse suivante partirait sous le plancher
    [InlineData(100)]
    public void PalierQueLaBaseNeSaitPasGarder_PoseAChaud_RetombeSurLesPaliersParDefaut(double seconds) =>
        Assert.Equal(
            DailyOptions.DefaultAllowedDurationsSeconds,
            new DailyOptions { AllowedDurationsSeconds = [1, (decimal)seconds] }.EffectiveAllowedDurationsSeconds);

    // --- le contrôle de cohérence ---

    [Fact]
    public void Controle_ReglagesParDefaut_RienAdire() =>
        Assert.Empty(DailyOptionsChecks.Problems(Defaults));

    [Theory]
    [InlineData(0.125)] // trois décimales : la colonne numeric(4,2) l'arrondirait
    [InlineData(100)] // la colonne ne tient pas 100 s
    public void Controle_PalierQueLaBaseNeSaitPasGarder_UnProbleme(double seconds) =>
        Assert.Single(DailyOptionsChecks.Problems(new DailyOptions { AllowedDurationsSeconds = [(decimal)seconds] }));

    [Fact]
    public void Controle_AutresReglagesAberrants()
    {
        var problems = DailyOptionsChecks.Problems(new DailyOptions
        {
            AllowedDurationsSeconds = [-1],
            DurationScores = [new DurationScore(0, 10)],
            StreakFreezeMax = -1,
        });

        Assert.Equal(3, problems.Count);
    }

    [Theory]
    [InlineData(9)]
    [InlineData(91)]
    [InlineData(0)]
    public void Controle_PartDuPoolEnCooldownHorsLimites_UnProbleme(int percent)
    {
        var problem = Assert.Single(DailyOptionsChecks.Problems(new DailyOptions { TrackCooldownPoolPercent = percent }));

        Assert.Contains("Daily:TrackCooldownPoolPercent", problem, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(10, 10)]
    [InlineData(90, 90)]
    [InlineData(91, 75)]
    [InlineData(-1, 75)]
    public void PartDuPoolEnCooldown_HorsLimites_RetombeSurLeDefaut(int configured, int effective) =>
        Assert.Equal(effective, new DailyOptions { TrackCooldownPoolPercent = configured }.EffectiveTrackCooldownPoolPercent);

    // --- les règles lues à chaud ---

    [Fact]
    public void Regles_PalierAutorise_LuAChaque_Appel()
    {
        var monitor = new FixedMonitor(new DailyOptions());
        var rules = new DailyRules(monitor, NullLogger<DailyRules>.Instance);
        Assert.True(rules.IsAllowedDuration(0.5m));

        monitor.Value = new DailyOptions { AllowedDurationsSeconds = [1, 2] };

        Assert.False(rules.IsAllowedDuration(0.5m));
        Assert.True(rules.IsAllowedDuration(2m));
    }

    private sealed class FixedMonitor(DailyOptions value) : IOptionsMonitor<DailyOptions>
    {
        public DailyOptions Value { get; set; } = value;

        public DailyOptions CurrentValue => Value;

        public DailyOptions Get(string? name) => Value;

        public IDisposable? OnChange(Action<DailyOptions, string?> listener) => null;
    }
}
