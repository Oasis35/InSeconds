using InSeconds.Api.Modules.Runs.Application;

namespace InSeconds.UnitTests.Runs;

/// <summary>Le repère des homonymes d'une comparaison : seulement pour eux, stable, distinct pour chacun.</summary>
public class PlayerTagsTests
{
    private static readonly Guid A = Guid.Parse("00000000-0000-0000-0000-000000000001");
    private static readonly Guid B = Guid.Parse("00000000-0000-0000-0000-000000000002");
    private static readonly Guid C = Guid.Parse("00000000-0000-0000-0000-000000000003");

    [Fact]
    public void PasDHomonymes_AucunRepere()
    {
        var tags = PlayerTags.ForHomonyms([A, B], new Dictionary<Guid, string> { [A] = "Léa", [B] = "Léo" });

        Assert.Empty(tags);
    }

    [Fact]
    public void Homonymes_SansTenirCompteDeLaCasse_ChacunSonRepere_Stable()
    {
        var pseudos = new Dictionary<Guid, string> { [A] = "Léa", [B] = "léa", [C] = "Léo" };

        var tags = PlayerTags.ForHomonyms([A, B, C], pseudos);

        Assert.Equal([A, B], tags.Keys.Order());
        Assert.NotEqual(tags[A], tags[B]);
        Assert.All(tags.Values, tag => Assert.Matches("^[0-9a-f]{2,8}$", tag));
        Assert.Equal(tags, PlayerTags.ForHomonyms([C, B, A], pseudos));
    }

    [Fact]
    public void UnJoueurSansPseudo_N_aPasDeRepere()
    {
        var tags = PlayerTags.ForHomonyms([A, B], new Dictionary<Guid, string> { [A] = "Léa" });

        Assert.Empty(tags);
    }
}
