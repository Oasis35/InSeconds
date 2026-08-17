using FluentAssertions;
using InSeconds.Api.Common.Text;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Text;

public sealed class TextNormalizationHelpersTests
{
    [Theory]
    [InlineData("Bohemian Rhapsody (Remastered 2011)", "Bohemian Rhapsody")]
    [InlineData("One Dance [Radio Edit]", "One Dance")]
    [InlineData("Song (feat. Someone) (Live)", "Song")]
    [InlineData("No Parentheses Here", "No Parentheses Here")]
    public void CleanDisplayTitle_removes_parentheses_and_brackets(string input, string expected)
    {
        TextNormalizationHelpers.CleanDisplayTitle(input).Should().Be(expected);
    }

    [Fact]
    public void CleanDisplayTitle_falls_back_to_original_when_fully_parenthesized()
    {
        TextNormalizationHelpers.CleanDisplayTitle("(Interlude)").Should().Be("(Interlude)");
    }

    [Fact]
    public void CleanDisplayTitle_collapses_double_spaces_left_by_removed_parentheses()
    {
        TextNormalizationHelpers.CleanDisplayTitle("Song (Live) Version").Should().Be("Song Version");
    }
}
