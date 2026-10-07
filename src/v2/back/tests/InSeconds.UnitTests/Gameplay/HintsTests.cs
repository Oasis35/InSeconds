using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Gameplay.Domain;

namespace InSeconds.UnitTests.Gameplay;

/// <summary>Les indices : année, artiste « pendu », cumul par niveau, politique de déblocage.</summary>
public class HintsTests
{
    private static readonly HintSubject DaftPunk = new("Daft Punk", "Get Lucky", 2013);
    private static readonly IHintProvider[] Providers = [new HangmanArtistHint(), new YearHint()];

    // --- niveau 1 : l'année ---

    [Fact]
    public void YearHint_RevelaLAnnee()
    {
        var fact = new YearHint().Reveal(DaftPunk);

        Assert.Equal(HintKind.Year, fact.Kind);
        Assert.Equal("2013", fact.Value);
    }

    [Fact]
    public void YearHint_AnneeInconnue_ValeurNulle() =>
        Assert.Null(new YearHint().Reveal(DaftPunk with { ReleaseYear = null }).Value);

    // --- niveau 2 : l'artiste « pendu » (cas de la v1) ---

    [Theory]
    [InlineData("Muse", "M _ _ _")]
    [InlineData("Daft Punk", "D _ _ _   P _ _ _")]
    [InlineData("Étienne", "É _ _ _ _ _ _")]
    [InlineData("The  Weeknd", "T _ _   W _ _ _ _ _")]
    [InlineData("  Muse  ", "M _ _ _")]
    [InlineData("U2", "U _")]
    [InlineData("Jay-Z", "J _ _ - _")]
    [InlineData("Guns N' Roses", "G _ _ _   N '   R _ _ _ _")]
    [InlineData("M83", "M _ _")]
    [InlineData("A", "A")]
    public void HangmanArtistHint_MasqueToutSaufLaPremiereLettreDeChaqueMot(string artist, string expected) =>
        Assert.Equal(expected, HangmanArtistHint.Mask(artist));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void HangmanArtistHint_NomSansMot_MotifVideSansErreur(string artist) =>
        Assert.Empty(HangmanArtistHint.Mask(artist));

    [Fact]
    public void HangmanArtistHint_RevelaLeNomMasque()
    {
        var fact = new HangmanArtistHint().Reveal(DaftPunk);

        Assert.Equal(HintKind.ArtistMasked, fact.Kind);
        Assert.Equal("D _ _ _   P _ _ _", fact.Value);
    }

    [Fact]
    public void HangmanArtistHint_NeRevelePasLeTitre() =>
        Assert.DoesNotContain("Lucky", new HangmanArtistHint().Reveal(DaftPunk).Value, StringComparison.Ordinal);

    // --- le cumul par niveau ---

    [Fact]
    public void Niveaux_UnEtDeux()
    {
        Assert.Equal(1, new YearHint().Level);
        Assert.Equal(2, new HangmanArtistHint().Level);
    }

    [Fact]
    public void UpTo_NiveauUn_RevelaSeulementLAnnee()
    {
        var facts = HintFacts.UpTo(1, Providers, DaftPunk);

        Assert.Equal([HintKind.Year], facts.Select(f => f.Kind));
    }

    [Fact]
    public void UpTo_NiveauDeux_EstCumulatif_DansLOrdreDesNiveaux()
    {
        var facts = HintFacts.UpTo(2, Providers, DaftPunk);

        Assert.Equal([HintKind.Year, HintKind.ArtistMasked], facts.Select(f => f.Kind));
        Assert.Equal("2013", facts[0].Value);
        Assert.Equal("D _ _ _   P _ _ _", facts[1].Value);
    }

    [Fact]
    public void UpTo_NiveauZero_NeRevelaRien() =>
        Assert.Empty(HintFacts.UpTo(0, Providers, DaftPunk));

    [Fact]
    public void UpTo_NiveauAuDessusDeCeQuiExiste_RevelaTout() =>
        Assert.Equal(2, HintFacts.UpTo(9, Providers, DaftPunk).Count);

    [Fact]
    public void UpTo_UnNouvelIndice_SAjouteSansToucherLesAutres()
    {
        // Un futur niveau 3 (décennie, genre…) n'est qu'un fournisseur de plus.
        var decade = new FakeDecadeHint();

        var facts = HintFacts.UpTo(3, [.. Providers, decade], DaftPunk);

        Assert.Equal(3, facts.Count);
        Assert.Equal("années 2010", facts[2].Value);
    }

    private sealed class FakeDecadeHint : IHintProvider
    {
        public int Level => 3;

        public HintFact Reveal(HintSubject subject) => new(HintKind.Year, "années 2010");
    }

    // --- la politique de déblocage ---

    [Fact]
    public void HintPolicy_ProposeLesNiveauxDeSaListe()
    {
        var policy = new HintPolicy([5m, 10m]);

        Assert.Equal(2, policy.LevelCount);
        Assert.True(policy.Proposes(1));
        Assert.True(policy.Proposes(2));
        Assert.False(policy.Proposes(0));
        Assert.False(policy.Proposes(3));
        Assert.Equal(5m, policy.UnlockSecondsOf(1));
        Assert.Equal(10m, policy.UnlockSecondsOf(2));
    }

    [Fact]
    public void HintPolicy_NiveauInconnu_Leve() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => new HintPolicy([5m]).UnlockSecondsOf(2));

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void HintPolicy_SeuilNonPositif_Refuse(int seconds) =>
        Assert.Throws<ArgumentException>(() => new HintPolicy([seconds]));

    [Fact]
    public void HintPolicy_SeuilsNonCroissants_Refuses()
    {
        Assert.Throws<ArgumentException>(() => new HintPolicy([10m, 5m]));
        Assert.Throws<ArgumentException>(() => new HintPolicy([5m, 5m]));
    }

    [Fact]
    public void HintPolicy_AucunIndice_EstValide()
    {
        Assert.Equal(0, HintPolicy.None.LevelCount);
        Assert.False(HintPolicy.None.Proposes(1));
    }

    [Fact]
    public void HintPolicy_MemesSeuils_SontEgales()
    {
        Assert.Equal(new HintPolicy([5m, 10m]), new HintPolicy([5m, 10m]));
        Assert.NotEqual(new HintPolicy([5m, 10m]), new HintPolicy([5m, 12m]));
        Assert.Equal(new HintPolicy([5m, 10m]).GetHashCode(), new HintPolicy([5m, 10m]).GetHashCode());
    }

    [Fact]
    public void HintPolicy_LesSeuilsExposes_NePermettentPasDeModifierLaPolitique()
    {
        var policy = new HintPolicy([5m, 10m]);

        Assert.Throws<NotSupportedException>(() => ((IList<decimal>)policy.UnlockSeconds)[0] = 0.01m);
        Assert.Equal(5m, policy.UnlockSecondsOf(1));
    }

    [Fact]
    public void HintPolicy_LaListeDOrigineModifieeApres_NeChangePasLaPolitique()
    {
        var source = new List<decimal> { 5m, 10m };
        var policy = new HintPolicy(source);

        source[0] = 1m;

        Assert.Equal(5m, policy.UnlockSecondsOf(1));
    }
}
