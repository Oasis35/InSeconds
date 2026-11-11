using InSeconds.Api.Modules.Gameplay.Domain;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>Les manches à thème d'une playlist (thèmes de la liste de l'admin, jamais la première manche) : ce qui s'offre, et le tirage.</summary>
public class RunThemesTests
{
    private static readonly RunRules Rules = RunsOptions.DefaultRules();
    private readonly RankBandSelector _selector = new(new FisherYatesShuffle());

    [Fact]
    public void SansTheme_TousLesMorceauxSontDedans_AvecTheme_SeulementCeuxQuiL_Ont()
    {
        Assert.True(RunThemes.Matches(null, null));
        Assert.True(RunThemes.Matches(3, [3]));
        Assert.True(RunThemes.Matches(3, [1, 3]));
        Assert.False(RunThemes.Matches(3, [4]));
        Assert.False(RunThemes.Matches(3, null));
    }

    [Fact]
    public void Offerts_SeulementLesThemesQuiOntAssezDeMorceauxPourUneMancheEtSaReserve()
    {
        // 5 morceaux de la manche + 2 de réserve = 7.
        var themes = Enumerable.Range(0, 7).Select(_ => (IReadOnlyList<int>?)[1])
            .Concat(Enumerable.Range(0, 6).Select(_ => (IReadOnlyList<int>?)[2])).Concat([null, []]).ToList();

        Assert.Equal([1], RunThemes.Eligible(themes, Rules));
        Assert.Equal([1, 2], RunThemes.Eligible(themes.Append([2]), Rules));
    }

    [Fact]
    public void LesReglesParDefaut_UneSeuleMancheATheme_LaTroisieme_JamaisLaPremiere() =>
        Assert.Equal([3], new RunsOptions().EffectiveThemedRounds);

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    public void UneMancheATheme_HorsDeLaDeuxiemeALaDerniere_RefuseeParLesReglages(int round) =>
        Assert.Contains(RunsOptionsChecks.Problems(new RunsOptions { ThemedRounds = [round] }), p => p.Contains("ThemedRounds"));

    [Fact]
    public void LaMancheATheme_NeTireQueDansLeTheme_LesAutresSuiventLeurTranche_AucunMorceauDeuxFois()
    {
        // 100 morceaux de rang décroissant ; les 10 de rang moyen (41 à 50) ont le thème 7.
        var pool = Enumerable.Range(1, 100).Select(id => new RankedTrack(id, 1_000_000 - id * 1000, id is >= 41 and <= 50 ? [7] : null)).ToList();
        var rules = Rules with { Themes = [new RunRoundTheme(3, 7, "Années 80")] };

        var selection = _selector.Select(pool, rules, seed: 5);

        Assert.True(selection.IsSufficient);
        var all = selection.Tracks.Concat(selection.Reserve!).ToList();
        Assert.Equal(all.Count, all.Select(t => t.TrackId).Distinct().Count());
        Assert.All(all.Where(t => t.Round == 3), t => Assert.InRange(t.TrackId, 41, 50));
        Assert.Equal(5, selection.Tracks.Count(t => t.Round == 3));
        Assert.Equal(20, selection.Tracks.Count);
    }

    [Fact]
    public void UnThemeTropPetitPourSaManche_LaRendASaTranche()
    {
        var pool = Enumerable.Range(1, 100).Select(id => new RankedTrack(id, 1_000_000 - id * 1000, id <= 3 ? [7] : null)).ToList();

        var selection = _selector.Select(pool, Rules with { Themes = [new RunRoundTheme(3, 7, "Films")] }, seed: 5);

        Assert.True(selection.IsSufficient);
        Assert.All(selection.Tracks.Where(t => t.Round == 3), t => Assert.InRange(t.TrackId, 51, 75));
    }

    [Fact]
    public void SansManchesATheme_LeTirageNEstPasChange()
    {
        var pool = Enumerable.Range(1, 100).Select(id => new RankedTrack(id, 1_000_000 - id * 1000)).ToList();

        Assert.Equal(_selector.Select(pool, Rules, seed: 9).Tracks, _selector.Select(pool, Rules with { Themes = [] }, seed: 9).Tracks);
    }
}
