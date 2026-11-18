using InSeconds.Api.Modules.Social.Domain;

namespace InSeconds.UnitTests.Social;

/// <summary>Les alias musicaux : leur forme, l'accord, les chiffres, et des listes sans doublon.</summary>
public class MusicalAliasTests
{
    [Fact]
    public void UnTirage_DonneDesAliasBienFormes_A2Chiffres()
    {
        var random = new Random(42);

        var aliases = MusicalAlias.Draw(random.Next, 500);

        Assert.Equal(500, aliases.Count);
        Assert.All(aliases, alias =>
        {
            Assert.True(MusicalAlias.IsWellFormed(alias), alias);
            Assert.Matches(@" [1-9]\d$", alias);
            Assert.True(alias.Length <= MusicalAlias.MaxLength);
        });
    }

    [Fact]
    public void A3Chiffres_QuandLesListesSaturent()
    {
        var alias = Assert.Single(MusicalAlias.Draw(new Random(1).Next, 1, digits: 3));

        Assert.Matches(@" [1-9]\d\d$", alias);
        Assert.True(MusicalAlias.IsWellFormed(alias));
    }

    [Fact]
    public void LAdjectif_SAccordeAuGenreDuNom()
    {
        // Le hasard est fourni : genre (0 : masculin), nom (0 : le premier), adjectif (0 : « fou »), nombre.
        var masculine = Assert.Single(MusicalAlias.Draw(_ => 0, 1));
        Assert.Equal("Métronome fou 10", masculine);

        var calls = 0;
        var feminine = Assert.Single(MusicalAlias.Draw(bound => calls++ == 0 ? bound - 1 : 0, 1));
        Assert.Equal("Guitare folle 10", feminine);
    }

    [Theory]
    [InlineData("Hibou rêveur 12", true)]
    [InlineData("Chouette rêveuse 45", true)]
    [InlineData("Métronome fou 167", true)]
    [InlineData("Hibou rêveur 07", false)]
    [InlineData("Hibou rêveur 1234", false)]
    [InlineData("Hibou méchant 12", false)]
    [InlineData("Licorne rêveuse 12", false)]
    [InlineData("Léa", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsWellFormed_NAccepteQueLesMotsDesListes(string? alias, bool expected) => Assert.Equal(expected, MusicalAlias.IsWellFormed(alias));

    [Fact]
    public void LesListes_SansDoublon_NiEspaceDansUnNom()
    {
        Assert.Equal(MusicalAlias.Nouns.Count, MusicalAlias.Nouns.Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.DoesNotContain(MusicalAlias.Nouns, noun => noun.Contains(' ', StringComparison.Ordinal));
    }

    [Fact]
    public void UnTirage_NAccepteQue2Ou3Chiffres() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => MusicalAlias.Draw(_ => 0, 1, digits: 4));
}
