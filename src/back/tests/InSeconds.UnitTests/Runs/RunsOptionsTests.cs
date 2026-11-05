using InSeconds.Api.Modules.Runs.Application;
using InSeconds.UnitTests.Support;
using Microsoft.Extensions.Options;

namespace InSeconds.UnitTests.Runs;

/// <summary>Les réglages <c>Runs:</c> : cohérence (au démarrage et à l'usage), valeurs par défaut quand un réglage chargé à chaud est faux.</summary>
public class RunsOptionsTests
{
    [Fact]
    public void LesReglagesParDefaut_SontCoherents() => Assert.Empty(RunsOptionsChecks.Problems(new RunsOptions()));

    [Fact]
    public void LesListesSansValeurInitiale_LeDefautEstDansEffective()
    {
        var options = new RunsOptions();

        Assert.Null(options.ThresholdPercents);
        Assert.Null(options.Difficulties);
        Assert.Equal([45, 55, 65, 75], options.EffectiveThresholdPercents);
        Assert.Equal(["easy", "safe", "risky"], options.EffectiveDifficulties.Select(d => d.Difficulty));
        Assert.Equal(5, options.EffectiveDiscs.Count);
        Assert.All(options.EffectiveDiscs, key => Assert.StartsWith("runs.discs.", key, StringComparison.Ordinal));
    }

    public static TheoryData<RunsOptions, string> Incoherent => new()
    {
        { new RunsOptions { Rounds = 0, ThresholdPercents = [] }, "Runs:Rounds" },
        { new RunsOptions { Rounds = 21, ThresholdPercents = new int[21] }, "Runs:Rounds" },
        { new RunsOptions { TracksPerRound = 0 }, "Runs:TracksPerRound" },
        { new RunsOptions { ListenSeconds = 0 }, "Runs:ListenSeconds" },
        { new RunsOptions { ListenSeconds = 100 }, "Runs:ListenSeconds" },
        { new RunsOptions { ListenSeconds = 10.123m }, "Runs:ListenSeconds" },
        { new RunsOptions { Rounds = 3 }, "Runs:ThresholdPercents" },
        { new RunsOptions { ThresholdPercents = [40, 50, 60, 0] }, "Runs:ThresholdPercents" },
        { new RunsOptions { ThresholdPercents = [40, 50, 60, 101] }, "Runs:ThresholdPercents" },
        { new RunsOptions { MinMultiplier = 3, MaxMultiplier = 2 }, "Runs:MinMultiplier" },
        { new RunsOptions { MinMultiplier = 0 }, "Runs:MinMultiplier" },
        { new RunsOptions { MaxMultiplier = 10 }, "Runs:MinMultiplier" },
        { new RunsOptions { MaxMultiplier = 2.005m }, "Runs:MinMultiplier" },
        { new RunsOptions { Discs = [] }, "Runs:Discs" },
        { new RunsOptions { Discs = ["runs.discs.gold", " "] }, "Runs:Discs" },
        { new RunsOptions { AnswerSeconds = 10 }, "Runs:AnswerSeconds" },
        { new RunsOptions { AnswerSeconds = 601 }, "Runs:AnswerSeconds" },
        { new RunsOptions { AnswerSeconds = -1 }, "Runs:AnswerSeconds" },
        { new RunsOptions { Difficulties = [] }, "Runs:Difficulties" },
        { new RunsOptions { Difficulties = [new() { Difficulty = "easy" }] }, "Runs:Difficulties" },
        { new RunsOptions { Difficulties = [new() { Difficulty = "safe" }, new() { Difficulty = "safe" }] }, "Runs:Difficulties" },
        { new RunsOptions { Difficulties = [new() { Difficulty = "safe" }, new() { Difficulty = "hard" }] }, "Runs:Difficulties" },
        { new RunsOptions { Difficulties = [new() { Difficulty = "safe", PointsFactor = 0 }] }, "Runs:Difficulties" },
        { new RunsOptions { Difficulties = [new() { Difficulty = "safe", ObjectiveFactor = 3.5m }] }, "Runs:Difficulties" },
        { new RunsOptions { Difficulties = [new() { Difficulty = "safe", ObjectiveFactor = 0.001m }] }, "Runs:Difficulties" },
        { new RunsOptions { BossListenSeconds = 11 }, "Runs:BossListenSeconds" },
        { new RunsOptions { BossListenSeconds = -1 }, "Runs:BossListenSeconds" },
        { new RunsOptions { BossListenSeconds = 2.005m }, "Runs:BossListenSeconds" },
        { new RunsOptions { ReservePerRound = -1 }, "Runs:ReservePerRound" },
        { new RunsOptions { ReservePerRound = 6 }, "Runs:ReservePerRound" },
    };

    [Theory]
    [MemberData(nameof(Incoherent))]
    public void UnReglageIncoherent_EstSignale(RunsOptions options, string setting) =>
        Assert.Contains(RunsOptionsChecks.Problems(options), problem => problem.Contains(setting, StringComparison.Ordinal));

    [Fact]
    public void UneAutreConfiguration_Coherente_EstAcceptee()
    {
        var options = new RunsOptions { Rounds = 2, TracksPerRound = 3, ListenSeconds = 7.5m, ThresholdPercents = [30, 60], MinMultiplier = 1.5m, MaxMultiplier = 3m };

        Assert.Empty(RunsOptionsChecks.Problems(options));
        var rules = options.ToRules();
        Assert.Equal((2, 3, 6, 7.5m), (rules.Rounds, rules.TracksPerRound, rules.TrackCount, rules.ListenSeconds));
    }

    [Fact]
    public void DesReglagesIncoherentsALUsage_RetombentSurLesDefauts_ErreurJournaleeUneFoisParValeur()
    {
        var monitor = new MutableOptions(new RunsOptions { Rounds = 0 });
        var logger = new CapturingLogger<RunsRules>();
        var rules = new RunsRules(monitor, logger);

        Assert.Equal(RunsOptions.DefaultRules().TrackCount, rules.Current().TrackCount);
        Assert.Equal(RunsOptions.DefaultRules().TrackCount, rules.Current().TrackCount);
        var logged = Assert.Single(logger.Entries);
        Assert.Equal((Microsoft.Extensions.Logging.LogLevel.Error, 1400), (logged.Level, logged.EventId.Id));

        // Corrigé, puis de nouveau faux : le problème est signalé de nouveau.
        monitor.Value = new RunsOptions { Rounds = 2, ThresholdPercents = [40, 50] };
        Assert.Equal(10, rules.Current().TrackCount);
        monitor.Value = new RunsOptions { Rounds = 0 };
        rules.Current();
        Assert.Equal(2, logger.Entries.Count);
    }

    [Fact]
    public void DesReglagesCoherents_SontRepris_ALaVolee()
    {
        var monitor = new MutableOptions(new RunsOptions { TracksPerRound = 3 });
        var rules = new RunsRules(monitor, new CapturingLogger<RunsRules>());

        Assert.Equal(12, rules.Current().TrackCount);
        monitor.Value = new RunsOptions { TracksPerRound = 4 };
        Assert.Equal(16, rules.Current().TrackCount);
    }

    [Fact]
    public async Task ContrôleDuDemarrage_RefuseDesReglagesIncoherents()
    {
        var check = new RunsOptionsStartupCheck(new MutableOptions(new RunsOptions { Rounds = 0 }));

        var exception = await Assert.ThrowsAsync<OptionsValidationException>(() => check.StartAsync(TestContext.Current.CancellationToken));
        Assert.Contains("Runs:Rounds", exception.Message, StringComparison.Ordinal);
        await new RunsOptionsStartupCheck(new MutableOptions(new RunsOptions())).StartAsync(TestContext.Current.CancellationToken);
    }

    private sealed class MutableOptions(RunsOptions initial) : IOptionsMonitor<RunsOptions>
    {
        public RunsOptions Value { get; set; } = initial;

        public RunsOptions CurrentValue => Value;

        public RunsOptions Get(string? name) => Value;

        public IDisposable? OnChange(Action<RunsOptions, string?> listener) => null;
    }
}
