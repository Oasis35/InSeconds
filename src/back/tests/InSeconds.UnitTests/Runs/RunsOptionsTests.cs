using InSeconds.Api.Modules.Runs.Application;
using InSeconds.UnitTests.Support;
using Microsoft.Extensions.Options;

namespace InSeconds.UnitTests.Runs;

/// <summary>Les réglages <c>Runs:</c> : cohérence (au démarrage et à l'usage), valeurs par défaut quand un réglage chargé à chaud est faux.</summary>
public class RunsOptionsTests
{
    [Fact]
    public void LesReglagesParDefaut_SontCoherents() => Assert.Empty(RunsOptionsChecks.Problems(new RunsOptions()));

    [Theory]
    [InlineData(-1, 50, 30)]
    [InlineData(91, 50, 30)]
    [InlineData(40, 101, 30)]
    [InlineData(40, 50, 0)]
    public void LaDiversiteHorsBornes_EstRefusee(int pool, int themes, int games)
    {
        var options = new RunsOptions { Diversity = new RunDiversityOptions { PoolPercent = pool, ThemePercent = themes, MaxGames = games } };

        Assert.Contains(RunsOptionsChecks.Problems(options), p => p.Contains("Runs:Diversity", StringComparison.Ordinal));
    }

    [Fact]
    public void LaDiversiteParDefaut_EstCelleDeLaProposition()
    {
        var diversity = new RunsOptions().Diversity;

        Assert.Equal((40, 50), (diversity.PoolPercent, diversity.ThemePercent));
    }

    [Fact]
    public void LesListesSansValeurInitiale_LeDefautEstDansEffective()
    {
        var options = new RunsOptions();

        Assert.Null(options.ListenLadder);
        Assert.Null(options.StepPoints);
        Assert.Equal([10m, 5m, 3m, 2m, 1m, 0.5m], options.EffectiveListenLadder);
        Assert.Equal([100, 200, 350, 550, 800, 1200], options.EffectiveStepPoints);
        Assert.Equal((3, 3, 45), (options.Lives, options.TracksPerRound, options.AnswerSeconds));
    }

    public static TheoryData<RunsOptions, string> Incoherent => new()
    {
        { new RunsOptions { Lives = 0 }, "Runs:Lives" },
        { new RunsOptions { Lives = 11 }, "Runs:Lives" },
        { new RunsOptions { TracksPerRound = 0 }, "Runs:TracksPerRound" },
        { new RunsOptions { TracksPerRound = 21 }, "Runs:TracksPerRound" },
        { new RunsOptions { RankBands = 0 }, "Runs:RankBands" },
        { new RunsOptions { ListenLadder = [10m] }, "Runs:ListenLadder" },
        { new RunsOptions { ListenLadder = [10m, 10m], StepPoints = [1, 2] }, "Runs:ListenLadder" },
        { new RunsOptions { ListenLadder = [5m, 10m], StepPoints = [1, 2] }, "Runs:ListenLadder" },
        { new RunsOptions { ListenLadder = [10m, 0m], StepPoints = [1, 2] }, "Runs:ListenLadder" },
        { new RunsOptions { ListenLadder = [10m, 0.123m], StepPoints = [1, 2] }, "Runs:ListenLadder" },
        { new RunsOptions { StepPoints = [100, 200] }, "Runs:StepPoints" },
        { new RunsOptions { StepPoints = [100, 200, 350, 550, 800, 0] }, "Runs:StepPoints" },
        { new RunsOptions { AnswerSeconds = 10 }, "Runs:AnswerSeconds" },
        { new RunsOptions { AnswerSeconds = 601 }, "Runs:AnswerSeconds" },
        { new RunsOptions { AnswerSeconds = -1 }, "Runs:AnswerSeconds" },
        { new RunsOptions { MaxRounds = -1 }, "Runs:MaxRounds" },
        { new RunsOptions { MaxRounds = 51 }, "Runs:MaxRounds" },
        { new RunsOptions { LifeBonus = -1 }, "Runs:LifeBonus" },
        { new RunsOptions { CompleteBonus = 100_001 }, "Runs:LifeBonus" },
    };

    [Theory]
    [MemberData(nameof(Incoherent))]
    public void UnReglageIncoherent_EstSignale(RunsOptions options, string setting) =>
        Assert.Contains(RunsOptionsChecks.Problems(options), problem => problem.Contains(setting, StringComparison.Ordinal));

    [Fact]
    public void UneAutreConfiguration_Coherente_EstAcceptee()
    {
        var options = new RunsOptions { Lives = 5, TracksPerRound = 3, ListenLadder = [8m, 4m, 1m], StepPoints = [10, 20, 40], AnswerSeconds = 0 };

        Assert.Empty(RunsOptionsChecks.Problems(options));
        var rules = options.ToRules();
        Assert.Equal((5, 3, 2), (rules.Lives, rules.TracksPerRound, rules.LastStep));
        Assert.False(rules.HasClock);
    }

    [Fact]
    public void DesReglagesIncoherentsALUsage_RetombentSurLesDefauts_ErreurJournaleeUneFoisParValeur()
    {
        var monitor = new MutableOptions(new RunsOptions { Lives = 0 });
        var logger = new CapturingLogger<RunsRules>();
        var rules = new RunsRules(monitor, logger);

        Assert.Equal(3, rules.Current().Lives);
        Assert.Equal(3, rules.Current().Lives);
        var logged = Assert.Single(logger.Entries);
        Assert.Equal((Microsoft.Extensions.Logging.LogLevel.Error, 1400), (logged.Level, logged.EventId.Id));

        // Corrigé, puis de nouveau faux : le problème est signalé de nouveau.
        monitor.Value = new RunsOptions { Lives = 5 };
        Assert.Equal(5, rules.Current().Lives);
        monitor.Value = new RunsOptions { Lives = 0 };
        rules.Current();
        Assert.Equal(2, logger.Entries.Count);
    }

    [Fact]
    public void DesReglagesCoherents_SontRepris_ALaVolee()
    {
        var monitor = new MutableOptions(new RunsOptions { TracksPerRound = 3 });
        var rules = new RunsRules(monitor, new CapturingLogger<RunsRules>());

        Assert.Equal(3, rules.Current().TracksPerRound);
        monitor.Value = new RunsOptions { TracksPerRound = 4 };
        Assert.Equal(4, rules.Current().TracksPerRound);
    }

    [Fact]
    public async Task ContrôleDuDemarrage_RefuseDesReglagesIncoherents()
    {
        var check = new RunsOptionsStartupCheck(new MutableOptions(new RunsOptions { Lives = 0 }));

        var exception = await Assert.ThrowsAsync<OptionsValidationException>(() => check.StartAsync(TestContext.Current.CancellationToken));
        Assert.Contains("Runs:Lives", exception.Message, StringComparison.Ordinal);
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
