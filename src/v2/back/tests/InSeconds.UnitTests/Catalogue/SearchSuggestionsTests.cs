using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Deezer;

namespace InSeconds.UnitTests.Catalogue;

/// <summary>Nettoyage et déduplication de l'autocomplétion publique (v1 : <c>SearchEndpoint.CleanAndDeduplicate</c>).</summary>
public class SearchSuggestionsTests
{
    private static DeezerTrack Track(string artist, string title, long id = 1) => new(id, artist, title, "p", null, null, null);

    [Fact]
    public void LesVariantesParenthesees_FusionnentEnUneSeuleSuggestionNettoyee()
    {
        var results = SearchTracksEndpoint.CleanAndDeduplicate(
        [
            Track("E2E Artist", "E2E Track (Remastered 2011)"),
            Track("E2E Artist", "E2E Track (Live)"),
            Track("E2E Artist", "E2E Track"),
            Track("Other Artist", "Another Track"),
        ]);

        Assert.Equal(
            [new TrackSuggestion("E2E Artist", "E2E Track"), new TrackSuggestion("Other Artist", "Another Track")],
            results);
    }

    [Fact]
    public void LaDeduplicationIgnoreLaCasse_EtGardeLaPremiereOccurrence()
    {
        var results = SearchTracksEndpoint.CleanAndDeduplicate([Track("Daft Punk", "Around The World"), Track("DAFT PUNK", "around the world (Live)")]);

        Assert.Equal([new TrackSuggestion("Daft Punk", "Around The World")], results);
    }

    [Fact]
    public void MemeTitreMaisArtisteDifferent_DeuxSuggestions()
    {
        var results = SearchTracksEndpoint.CleanAndDeduplicate([Track("A", "Titre"), Track("B", "Titre")]);

        Assert.Equal(2, results.Count);
    }

    [Fact]
    public void Plafonne_ADixSuggestions()
    {
        var tracks = Enumerable.Range(1, 25).Select(i => Track($"Artiste {i}", $"Titre {i}", i)).ToList();

        var results = SearchTracksEndpoint.CleanAndDeduplicate(tracks);

        Assert.Equal(SearchTracksEndpoint.ResultLimit, results.Count);
        Assert.Equal("Titre 1", results[0].Title);
        Assert.Equal("Titre 10", results[^1].Title);
    }

    [Fact]
    public void LaSuggestionNeContientQueArtisteEtTitre()
    {
        // Rien qui désigne le morceau chez Deezer : pas d'identifiant, pas d'extrait, pas de pochette.
        Assert.Equal(["Artist", "Title"], typeof(TrackSuggestion).GetProperties().Select(p => p.Name).Order(StringComparer.Ordinal));
    }
}
