using FluentAssertions;
using InSeconds.Api.Features.Deezer;
using InSeconds.Api.Infrastructure.Deezer;
using Xunit;

namespace InSeconds.Api.UnitTests.Features.Deezer;

public sealed class SearchEndpointTests
{
    private static DeezerTrackInfo Track(string artist, string title, long id = 1) =>
        new(artist, title, "https://preview.mp3", id, null);

    [Theory]
    [InlineData("Bohemian Rhapsody (Remastered 2011)", "Bohemian Rhapsody")]
    [InlineData("One Dance [Radio Edit]", "One Dance")]
    [InlineData("Song (feat. Someone) (Live)", "Song")]
    [InlineData("No Parentheses Here", "No Parentheses Here")]
    public void CleanTitle_removes_parentheses_and_brackets(string input, string expected)
    {
        SearchEndpoint.CleanTitle(input).Should().Be(expected);
    }

    [Fact]
    public void CleanTitle_falls_back_to_original_when_fully_parenthesized()
    {
        SearchEndpoint.CleanTitle("(Interlude)").Should().Be("(Interlude)");
    }

    [Fact]
    public void CleanTitle_collapses_double_spaces_left_by_removed_parentheses()
    {
        SearchEndpoint.CleanTitle("Song (Live) Version").Should().Be("Song Version");
    }

    [Fact]
    public void CleanAndDeduplicate_merges_variants_that_become_identical_after_cleaning()
    {
        var tracks = new[]
        {
            Track("Queen", "Bohemian Rhapsody (Remastered 2011)", 1),
            Track("Queen", "Bohemian Rhapsody (Live Aid)", 2),
            Track("Queen", "Bohemian Rhapsody", 3),
        };

        var results = SearchEndpoint.CleanAndDeduplicate(tracks);

        results.Should().ContainSingle();
        results[0].Should().Be(new DeezerSearchResult("Queen", "Bohemian Rhapsody"));
    }

    [Fact]
    public void CleanAndDeduplicate_keeps_first_occurrence_order()
    {
        var tracks = new[]
        {
            Track("Artist", "Title (Version A)", 1),
            Track("Artist", "Title (Version B)", 2),
            Track("Other Artist", "Different Title", 3),
        };

        var results = SearchEndpoint.CleanAndDeduplicate(tracks);

        results.Should().HaveCount(2);
        results[0].Should().Be(new DeezerSearchResult("Artist", "Title"));
        results[1].Should().Be(new DeezerSearchResult("Other Artist", "Different Title"));
    }

    [Fact]
    public void CleanAndDeduplicate_is_case_insensitive_on_dedup_key()
    {
        var tracks = new[]
        {
            Track("Daft Punk", "One More Time", 1),
            Track("daft punk", "one more time", 2),
        };

        var results = SearchEndpoint.CleanAndDeduplicate(tracks);

        results.Should().ContainSingle();
    }

    [Fact]
    public void CleanAndDeduplicate_caps_output_at_ten_results()
    {
        var tracks = Enumerable.Range(1, 20)
            .Select(i => Track($"Artist {i}", $"Title {i}", i))
            .ToArray();

        var results = SearchEndpoint.CleanAndDeduplicate(tracks);

        results.Should().HaveCount(10);
    }

    [Fact]
    public void CleanAndDeduplicate_returns_empty_for_no_tracks()
    {
        SearchEndpoint.CleanAndDeduplicate([]).Should().BeEmpty();
    }
}
