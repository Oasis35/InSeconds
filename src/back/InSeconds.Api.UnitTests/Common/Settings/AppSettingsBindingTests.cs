using FluentAssertions;
using Xunit;
using InSeconds.Api.Common.Settings;
using Microsoft.Extensions.Configuration;

namespace InSeconds.Api.UnitTests.Common.Settings;

public sealed class AppSettingsBindingTests
{
    private static AppSettings Configure(Dictionary<string, string?> values)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(values.ToDictionary(kv => $"AppDb:{kv.Key}", kv => kv.Value))
            .Build();
        var options = new AppSettings();
        config.GetSection(AppDbConfigurationProvider.SectionPrefix).Bind(options);
        new AppSettingsPostConfigure(config).PostConfigure(null, options);
        return options;
    }

    [Fact]
    public void Configure_ParsesAllSettings()
    {
        var result = Configure(new()
        {
            ["GuessTimerSeconds"]       = "30",
            ["AllowedDurationsSeconds"] = "1,3,5",
            ["MaxExtensionsPerAnswer"]  = "2",
            ["TracksPerChallenge"]      = "5",
            ["DurationScores"]          = "1:900,3:600,5:400",
        });

        result.GuessTimerSeconds.Should().Be(30);
        result.AllowedDurationsSeconds.Should().Equal(1, 3, 5);
        result.MaxExtensionsPerAnswer.Should().Be(2);
        result.TracksPerChallenge.Should().Be(5);
        result.DurationScores.Should().BeEquivalentTo(new Dictionary<int, int> { [1] = 900, [3] = 600, [5] = 400 });
    }

    [Fact]
    public void Configure_WhenNoSettings_ReturnsDefaults()
    {
        var result   = Configure(new());
        var defaults = new AppSettings();

        result.GuessTimerSeconds.Should().Be(defaults.GuessTimerSeconds);
        result.AllowedDurationsSeconds.Should().Equal(defaults.AllowedDurationsSeconds);
        result.MaxExtensionsPerAnswer.Should().Be(defaults.MaxExtensionsPerAnswer);
        result.TracksPerChallenge.Should().Be(defaults.TracksPerChallenge);
        result.DurationScores.Should().BeEquivalentTo(defaults.DurationScores);
    }

    [Fact]
    public void Configure_WhenSomeMissing_UsesDefaultForMissingKey()
    {
        var result = Configure(new() { ["GuessTimerSeconds"] = "15" });

        result.GuessTimerSeconds.Should().Be(15);
        result.AllowedDurationsSeconds.Should().Equal(new AppSettings().AllowedDurationsSeconds);
    }

    [Fact]
    public void Configure_WhenDurationScoresMalformed_ReturnsDefault()
    {
        var result = Configure(new() { ["DurationScores"] = "invalide" });

        result.DurationScores.Should().BeEquivalentTo(new AppSettings().DurationScores);
    }

    [Fact]
    public void Configure_WhenAllowedDurationsMalformed_ReturnsDefault()
    {
        var result = Configure(new() { ["AllowedDurationsSeconds"] = "abc,def" });

        result.AllowedDurationsSeconds.Should().Equal(new AppSettings().AllowedDurationsSeconds);
    }
}
