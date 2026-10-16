using InSeconds.Api.Modules.Catalogue.Contracts;

namespace InSeconds.UnitTests.Catalogue;

public class TrackTitlesTests
{
    [Theory]
    [InlineData("Song (Remastered 2011)", "Song")]
    [InlineData("One Dance [Radio Edit]", "One Dance")]
    [InlineData("Song (feat. Someone) (Live)", "Song")]
    [InlineData("No Parentheses Here", "No Parentheses Here")]
    [InlineData("Song (Live) Version", "Song Version")]
    [InlineData("  Spaced   Out  ", "Spaced Out")]
    public void CleanDisplayTitle_RetireParenthesesEtCrochets_EtLesEspacesEnDouble(string input, string expected) =>
        Assert.Equal(expected, TrackTitles.CleanDisplayTitle(input));

    [Theory]
    [InlineData("(Interlude)")]
    [InlineData("[Intro]")]
    public void CleanDisplayTitle_TitreEntierementEntreParentheses_GardeLOriginal(string input) =>
        Assert.Equal(input, TrackTitles.CleanDisplayTitle(input));
}
