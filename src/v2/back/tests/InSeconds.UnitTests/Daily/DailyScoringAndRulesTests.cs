using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;
using InSeconds.UnitTests.Support;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace InSeconds.UnitTests.Daily;

/// <summary>Le barème de la v1, repris tel quel, et les règles du défi du jour lues dans les réglages.</summary>
public class DailyScoringAndRulesTests
{
    private static readonly DailyOptions Defaults = new();

    private static DurationScoringPolicy Policy() =>
        new(Defaults.EffectiveDurationScores, Defaults.EffectiveHintPenaltyPercent);

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
        Assert.Equal(expected, Policy().Score(new RoundOutcome(true, true, (decimal)seconds, 0)));

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void Score_UnSeulDesDeux_LaMoitie(bool artist, bool title) =>
        Assert.Equal(425, Policy().Score(new RoundOutcome(artist, title, 1, 0)));

    [Fact]
    public void Score_RienDeTrouve_ZeroPoint() =>
        Assert.Equal(0, Policy().Score(new RoundOutcome(false, false, 0.5m, 0)));

    [Fact]
    public void Score_PalierInconnuOuPasse_ZeroPoint()
    {
        Assert.Equal(0, Policy().Score(new RoundOutcome(true, true, 4, 0)));
        Assert.Equal(0, Policy().Score(new RoundOutcome(true, true, 0, 0)));
    }

    [Theory]
    [InlineData(1, 595)] // 850 × 0,7
    [InlineData(2, 340)] // 850 × 0,4
    [InlineData(3, 850)] // niveau sans pénalité configurée
    public void Score_LaPenaliteDeLIndiceSAppliqueAuScoreDuPalier(int level, int expected) =>
        Assert.Equal(expected, Policy().Score(new RoundOutcome(true, true, 1, level)));

    [Fact]
    public void Score_Penalite_ApresLaMoitie_ArrondiAuPairLePlusProche_CommeEnV1()
    {
        // 425 × 0,7 = 297,5 → 298 (le pair le plus proche), comme Math.Round de la v1.
        Assert.Equal(298, Policy().Score(new RoundOutcome(true, false, 1, 1)));
        // 275 × 0,7 = 192,5 → 192.
        Assert.Equal(192, Policy().Score(new RoundOutcome(false, true, 2, 1)));
    }

    [Fact]
    public void Score_UnPalierEcritDeuxFois_LeDernierL_Emporte_SansException()
    {
        var policy = new DurationScoringPolicy([new DurationScore(1, 100), new DurationScore(1, 300)], new Dictionary<int, int>());

        Assert.Equal(300, policy.Score(new RoundOutcome(true, true, 1, 0)));
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 30)]
    [InlineData(2, 60)]
    [InlineData(3, 0)]
    public void PenalitePourcent_ParNiveau(int level, int expected) => Assert.Equal(expected, Policy().HintPenaltyPercent(level));

    // --- les réglages ---

    [Fact]
    public void ParDefaut_LesValeursDeLaV1()
    {
        Assert.Equal([0.5m, 1m, 1.5m, 2m, 3m, 5m, 10m], Defaults.EffectiveAllowedDurationsSeconds);
        Assert.Equal([5m, 10m], Defaults.EffectiveHintUnlockDurationsSeconds);
        Assert.Equal(7, Defaults.StreakRules.FreezeEveryDays);
        Assert.Equal(2, Defaults.StreakRules.FreezeMax);
        Assert.Equal(2, Defaults.StreakRules.LostNudgeMinDays);
        Assert.Equal(20, Defaults.GuessTimerSeconds);
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
            ["Daily:HintUnlockDurationsSeconds:0"] = "1.5",
            ["Daily:HintPenaltyPercent:1"] = "10",
        }).Build();

        var options = configuration.GetSection(DailyOptions.Section).Get<DailyOptions>()!;

        Assert.Equal([1m, 2m], options.EffectiveAllowedDurationsSeconds);
        Assert.Equal([new DurationScore(1, 500)], options.EffectiveDurationScores);
        Assert.Equal([1.5m], options.EffectiveHintUnlockDurationsSeconds);
        Assert.Equal(new Dictionary<int, int> { [1] = 10 }, options.EffectiveHintPenaltyPercent.ToDictionary());
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
        Assert.Empty(DailyOptionsChecks.Problems(Defaults, maxHintLevel: 2));

    [Fact]
    public void Controle_PlusDeNiveauxQueDeFournisseurs_UnProbleme()
    {
        var problem = Assert.Single(DailyOptionsChecks.Problems(new DailyOptions { HintUnlockDurationsSeconds = [5, 10, 15] }, maxHintLevel: 2));

        Assert.Contains("3 niveaux d'indice", problem, StringComparison.Ordinal);
        Assert.Contains("n'en révèlent que 2", problem, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(new[] { 10.0, 5.0 })]
    [InlineData(new[] { 5.0, 5.0 })]
    [InlineData(new[] { 0.0, 5.0 })]
    [InlineData(new[] { -1.0 })]
    public void Controle_SeuilsNonCroissantsOuNonPositifs_UnProbleme(double[] thresholds) =>
        Assert.Contains(
            DailyOptionsChecks.Problems(new DailyOptions { HintUnlockDurationsSeconds = thresholds.Select(t => (decimal)t).ToArray() }, 2),
            p => p.Contains("strictement positif et croissant", StringComparison.Ordinal));

    [Theory]
    [InlineData(0.125)] // trois décimales : la colonne numeric(4,2) l'arrondirait
    [InlineData(100)] // la colonne ne tient pas 100 s
    public void Controle_PalierQueLaBaseNeSaitPasGarder_UnProbleme(double seconds) =>
        Assert.Single(DailyOptionsChecks.Problems(new DailyOptions { AllowedDurationsSeconds = [(decimal)seconds] }, 2));

    [Fact]
    public void Controle_AutresReglagesAberrants()
    {
        var problems = DailyOptionsChecks.Problems(new DailyOptions
        {
            AllowedDurationsSeconds = [-1],
            DurationScores = [new DurationScore(0, 10)],
            HintPenaltyPercent = new Dictionary<int, int> { [1] = 130 },
            StreakFreezeMax = -1,
        }, 2);

        Assert.Equal(4, problems.Count);
    }

    // --- les règles lues à chaud ---

    [Fact]
    public void Regles_LesNiveauxDIndice_DisentCeQuIlsRevelentEtCeQuIlsCoutent()
    {
        var levels = Rules(new DailyOptions()).HintLevels;

        Assert.Equal(
            [(1, 5m, "year", 30), (2, 10m, "artistMasked", 60)],
            levels.Select(l => (l.Level, l.UnlockSeconds, l.KindName, l.PenaltyPercent)));
    }

    [Fact]
    public void Regles_TropDeNiveaux_SontBornesAuxFournisseurs()
    {
        var rules = Rules(new DailyOptions { HintUnlockDurationsSeconds = [1, 2, 3] });

        Assert.Equal(2, rules.HintLevels.Count);
        Assert.Equal(new HintPolicy([1m, 2m]), rules.Hints);
    }

    [Fact]
    public void Regles_SeuilsIncoherents_ReprennentCeuxDeLaV1()
    {
        var rules = Rules(new DailyOptions { HintUnlockDurationsSeconds = [10, 5] });

        Assert.Equal([5m, 10m], rules.HintLevels.Select(l => l.UnlockSeconds));
    }

    [Fact]
    public void Regles_SansFournisseur_PasDIndice()
    {
        var rules = Rules(new DailyOptions(), providers: []);

        Assert.Empty(rules.HintLevels);
        Assert.Equal(HintPolicy.None, rules.Hints);
        Assert.Equal(0, rules.MaxHintLevel);
    }

    [Fact]
    public void Regles_TropDeNiveaux_UneSeuleErreurParValeur_EtDeNouveauSiElleRevient()
    {
        var monitor = new FixedMonitor(new DailyOptions { HintUnlockDurationsSeconds = [1, 2, 3] });
        var logger = new CapturingLogger<DailyRules>();
        var rules = new DailyRules(monitor, [new YearHint(), new HangmanArtistHint()], logger);

        // Une demande d'indice lit les règles plusieurs fois : une seule erreur.
        _ = rules.HintLevels;
        _ = rules.Hints;
        _ = rules.HintLevels;
        Assert.Single(logger.Entries, e => e.EventId.Id == 1305);

        monitor.Value = new DailyOptions { HintUnlockDurationsSeconds = [1, 2, 3, 4] };
        _ = rules.HintLevels;
        Assert.Equal(2, logger.Entries.Count(e => e.EventId.Id == 1305));

        // Corrigé, puis le même réglage faux revient : il est signalé de nouveau.
        monitor.Value = new DailyOptions();
        _ = rules.HintLevels;
        monitor.Value = new DailyOptions { HintUnlockDurationsSeconds = [1, 2, 3, 4] };
        _ = rules.HintLevels;
        Assert.Equal(3, logger.Entries.Count(e => e.EventId.Id == 1305));
    }

    [Fact]
    public void Regles_SeuilsIncoherents_UneSeuleErreurParValeur()
    {
        var logger = new CapturingLogger<DailyRules>();
        var rules = new DailyRules(
            new FixedMonitor(new DailyOptions { HintUnlockDurationsSeconds = [10, 5] }), [new YearHint(), new HangmanArtistHint()], logger);

        _ = rules.HintLevels;
        _ = rules.Hints;

        Assert.Single(logger.Entries, e => e.EventId.Id == 1306);
    }

    [Fact]
    public void Regles_FournisseursAvecUnTrou_SArretentAuTrou()
    {
        var rules = Rules(new DailyOptions(), providers: [new YearHint(), new LevelThreeHint()]);

        Assert.Equal(1, rules.MaxHintLevel);
        var level = Assert.Single(rules.HintLevels);
        Assert.Equal(HintKind.Year, level.Kind);
    }

    [Fact]
    public void Regles_PalierAutorise_LuAChaque_Appel()
    {
        var monitor = new FixedMonitor(new DailyOptions());
        var rules = new DailyRules(monitor, [new YearHint(), new HangmanArtistHint()], NullLogger<DailyRules>.Instance);
        Assert.True(rules.IsAllowedDuration(0.5m));

        monitor.Value = new DailyOptions { AllowedDurationsSeconds = [1, 2] };

        Assert.False(rules.IsAllowedDuration(0.5m));
        Assert.True(rules.IsAllowedDuration(2m));
    }

    [Theory]
    [InlineData(HintKind.Year, "year")]
    [InlineData(HintKind.ArtistMasked, "artistMasked")]
    public void TypeDIndice_EnTexteCamelCase_QueLeFrontSaitLire(HintKind kind, string expected) =>
        Assert.Equal(expected, HintLevelInfo.KindNameOf(kind));

    private static DailyRules Rules(DailyOptions options, IEnumerable<IHintProvider>? providers = null) =>
        new(new FixedMonitor(options), providers ?? [new YearHint(), new HangmanArtistHint()], NullLogger<DailyRules>.Instance);

    private sealed class LevelThreeHint : IHintProvider
    {
        public int Level => 3;

        public HintKind Kind => HintKind.ArtistMasked;

        public HintFact Reveal(HintSubject subject) => new(Kind, subject.Artist);
    }

    private sealed class FixedMonitor(DailyOptions value) : IOptionsMonitor<DailyOptions>
    {
        public DailyOptions Value { get; set; } = value;

        public DailyOptions CurrentValue => Value;

        public DailyOptions Get(string? name) => Value;

        public IDisposable? OnChange(Action<DailyOptions, string?> listener) => null;
    }
}
