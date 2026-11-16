using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>Les manches à thème d'une playlist (thèmes de la liste de l'admin, jamais la première manche) : ce qui s'offre.</summary>
public class RunThemesTests
{
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
    public void Offerts_SeulementLesThemesQuiOntAssezDeMorceauxPourUneManche()
    {
        var themes = Enumerable.Range(0, 5).Select(_ => (IReadOnlyList<int>?)[1])
            .Concat(Enumerable.Range(0, 4).Select(_ => (IReadOnlyList<int>?)[2])).Concat([null, []]).ToList();

        Assert.Equal([1], RunThemes.Eligible(themes, tracksPerRound: 5));
        Assert.Equal([1, 2], RunThemes.Eligible(themes.Append([2]), tracksPerRound: 5));
    }

    [Fact]
    public void UnChoixDeThemeDemandeTroisThemesAuMoins_DeuxAChoisirEtDeQuoiTirerLeMystere() =>
        Assert.Equal(3, RunThemes.MinEligibleThemes);
}
